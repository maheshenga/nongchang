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

function runAudit() {
  const command = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  return new Promise((resolveAudit, reject) => {
    const child = spawn(command, ['pnpm@10.33.2', 'audit', '--prod', '--json'], {
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
      if (code !== 0 && code !== 1) reject(new Error(`pnpm audit failed: ${stderr.trim().slice(0, 2_000)}`));
      else resolveAudit(JSON.parse(stdout));
    });
  });
}

export async function checkCurrentAdvisoryBudget() {
  const [audit, budget] = await Promise.all([
    runAudit(),
    readFile(resolve(REPO_ROOT, 'docs/ops/dependency-advisory-budget.json'), 'utf8').then(JSON.parse),
  ]);
  const advisories = Object.values(audit.advisories ?? {}).map((item) => ({
    package: item.module_name,
    advisory: item.github_advisory_id,
    severity: item.severity,
  }));
  validateAdvisoryBudget(budget, advisories);
  return audit.metadata?.vulnerabilities;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkCurrentAdvisoryBudget().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`advisory budget failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
