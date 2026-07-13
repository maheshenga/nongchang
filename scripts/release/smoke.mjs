import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

export async function waitForReadiness(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 2_000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return;
    } catch {
      // A bounded retry is safer than treating a transient connection refusal as ready.
    }
    if (attempt < attempts && delayMs > 0) await sleep(delayMs);
  }
  throw new Error(`readiness timeout after ${attempts} attempts`);
}

async function requireOk(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`smoke request failed (${response.status}): ${new URL(url).pathname}`);
  return response;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--base-url') options.baseUrl = argv[++i];
    else if (argv[i] === '--trace-code') options.traceCode = argv[++i];
    else if (argv[i] === '--access-token') options.accessToken = argv[++i];
    else if (argv[i] === '--expected-sha') options.expectedSha = argv[++i];
    else throw new Error(`unknown smoke argument: ${argv[i]}`);
  }
  const parsed = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--base-url must be HTTP(S)');
  return { ...options, baseUrl: parsed.toString().replace(/\/$/, '') };
}

export async function runSmoke(options) {
  const readyUrl = `${options.baseUrl}/api/health/ready`;
  await waitForReadiness(readyUrl);
  const live = await (await requireOk(`${options.baseUrl}/api/health/live`)).json();
  if (options.expectedSha && live.deployedGitSha !== options.expectedSha) {
    throw new Error('deployed Git SHA does not match the immutable artifact');
  }
  if (options.traceCode) await requireOk(`${options.baseUrl}/api/public/trace/${encodeURIComponent(options.traceCode)}`);
  if (options.accessToken) {
    await requireOk(`${options.baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${options.accessToken}` } });
  }
  return { status: 'ok', deployedGitSha: live.deployedGitSha ?? null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSmoke(parseArgs(process.argv.slice(2))).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
