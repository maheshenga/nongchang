import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function validateAdvisoryBudget(budget, advisories, now = new Date()) {
  const blocking = advisories.filter((item) => item.severity === 'high' || item.severity === 'critical');
  if (blocking.length > 0) throw new Error('production audit contains high or critical advisories');
  const moderate = advisories.filter((item) => item.severity === 'moderate');
  const maxDays = Number(budget.policy?.moderateExceptionMaxDays);
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 90) {
    throw new Error('moderate advisory policy must allow at most 90 days');
  }
  const entries = new Map();
  for (const entry of budget.exceptions ?? []) {
    const key = `${entry.package}:${entry.advisory}`;
    if (entries.has(key)) throw new Error(`duplicate advisory budget entry: ${key}`);
    entries.set(key, entry);
  }
  for (const advisory of moderate) {
    const key = `${advisory.package}:${advisory.advisory}`;
    const entry = entries.get(key);
    if (!entry) throw new Error(`missing moderate advisory budget: ${key}`);
    for (const field of ['owner', 'reason', 'compensatingControl', 'expires']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error(`incomplete advisory budget: ${key}`);
    }
    const expires = new Date(`${entry.expires}T23:59:59Z`);
    if (Number.isNaN(expires.getTime()) || expires <= now) throw new Error(`expired advisory budget: ${key}`);
    if (expires.getTime() - now.getTime() > maxDays * 86_400_000) {
      throw new Error(`advisory budget exceeds ${maxDays} days: ${key}`);
    }
    entries.delete(key);
  }
  if (entries.size > 0) throw new Error(`stale advisory budget entries: ${[...entries.keys()].join(', ')}`);
}

export function collectPackageVersions(projects) {
  const packages = new Map();
  const visit = (dependencies = {}) => {
    for (const [name, dependency] of Object.entries(dependencies ?? {})) {
      const version = dependency?.version;
      if (typeof version === 'string' && !/^(?:link|workspace|file):/.test(version)) {
        if (!packages.has(name)) packages.set(name, new Set());
        packages.get(name).add(version);
      }
      visit(dependency?.dependencies);
      visit(dependency?.optionalDependencies);
    }
  };
  for (const project of projects) {
    visit(project.dependencies);
    visit(project.optionalDependencies);
  }
  return Object.fromEntries([...packages.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, versions]) => [name, [...versions].sort()]));
}

export function normalizeBulkAdvisories(report) {
  const advisories = [];
  for (const [packageName, entries] of Object.entries(report ?? {})) {
    for (const entry of entries ?? []) {
      const advisory = String(entry.url ?? '').match(/GHSA-[a-z0-9-]+/i)?.[0];
      if (!advisory) throw new Error(`registry advisory for ${packageName} has no GitHub advisory ID`);
      advisories.push({ package: packageName, advisory, severity: entry.severity });
    }
  }
  return advisories;
}

function runDependencyList() {
  const command = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  return new Promise((resolveList, reject) => {
    const child = spawn(command, ['pnpm@10.33.2', '-r', 'list', '--prod', '--json', '--depth', 'Infinity'], {
      cwd: REPO_ROOT,
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(`production dependency listing failed: ${stderr.trim().slice(0, 2_000)}`));
      else resolveList(JSON.parse(stdout));
    });
  });
}

async function runBulkAudit(packageVersions) {
  const registry = process.env.npm_config_registry?.trim() || 'https://registry.npmjs.org/';
  const endpoint = new URL('-/npm/v1/security/advisories/bulk', registry.endsWith('/') ? registry : `${registry}/`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(packageVersions),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`bulk advisory registry request failed with HTTP ${response.status}`);
  return response.json();
}

export async function checkCurrentAdvisoryBudget() {
  const [projects, budget] = await Promise.all([
    runDependencyList(),
    readFile(resolve(REPO_ROOT, 'docs/ops/dependency-advisory-budget.json'), 'utf8').then(JSON.parse),
  ]);
  const packageVersions = collectPackageVersions(projects);
  const advisories = normalizeBulkAdvisories(await runBulkAudit(packageVersions));
  validateAdvisoryBudget(budget, advisories);
  return {
    packagesChecked: Object.keys(packageVersions).length,
    advisories: advisories.length,
    high: advisories.filter((item) => item.severity === 'high').length,
    critical: advisories.filter((item) => item.severity === 'critical').length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkCurrentAdvisoryBudget().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`advisory budget failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
