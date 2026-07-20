import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveBrowserBackendEnv,
  resolveBrowserServerConfig,
  resolveManagedBrowserProcesses,
} from '../packages/web/test/browser-server-config';

interface ProcessPlan {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface BrowserRunPlan {
  backend: ProcessPlan;
  web: ProcessPlan;
  playwright: ProcessPlan;
  backendUrl: string;
  webUrl: string;
  backendPort: number;
  webPort: number;
  manageServers: boolean;
}

export function normalizeTestArgs(args: string[]): string[] {
  return args[0] === '--' ? args.slice(1) : args;
}

export function buildBrowserRunPlan(input: {
  env: NodeJS.ProcessEnv;
  nodeExecutable: string;
  repoRoot: string;
  testArgs: string[];
}): BrowserRunPlan {
  const servers = resolveBrowserServerConfig(input.env);
  const managed = resolveManagedBrowserProcesses({
    nodeExecutable: input.nodeExecutable,
    webPort: servers.webPort,
  });
  return {
    backend: {
      ...managed.backend,
      cwd: input.repoRoot,
      env: resolveBrowserBackendEnv(input.env, servers.backendPort),
    },
    web: {
      ...managed.web,
      cwd: input.repoRoot,
      env: {
        ...input.env,
        WEB_API_PROXY_TARGET: servers.backendUrl,
      },
    },
    playwright: {
      command: input.nodeExecutable,
      args: [
        path.join(input.repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
        'test',
        ...input.testArgs,
      ],
      cwd: input.repoRoot,
      env: {
        ...input.env,
        E2E_BACKEND_PORT: String(servers.backendPort),
        E2E_WEB_PORT: String(servers.webPort),
        E2E_REUSE_SERVERS: 'true',
      },
    },
    backendUrl: servers.backendUrl,
    webUrl: servers.webUrl,
    backendPort: servers.backendPort,
    webPort: servers.webPort,
    manageServers: !servers.reuseExistingServer,
  };
}

export async function assertPortUnused(port: number, host = '127.0.0.1'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error(`Port ${port} is already in use`));
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(error);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`Timed out checking port ${port}`));
    });
  });
}

export async function assertUrlAvailable(url: string): Promise<void> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Existing server is not available at ${url}`, { cause: error });
  }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    once(child, 'exit'),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function stopManagedProcess(child: ChildProcess, timeoutMs = 5_000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await waitForExit(child, timeoutMs);
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await waitForExit(child, timeoutMs);
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error(`Managed process ${child.pid ?? 'unknown'} did not exit`);
  }
}

async function waitForUrl(url: string, child: ChildProcess, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let spawnError: Error | undefined;
  child.once('error', (error) => {
    spawnError = error;
  });
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Managed process exited before ${url} became ready`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForProcessExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

function startProcess(plan: ProcessPlan): ChildProcess {
  return spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: plan.env,
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function run(): Promise<number> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const plan = buildBrowserRunPlan({
    env: process.env,
    nodeExecutable: process.execPath,
    repoRoot,
    testArgs: normalizeTestArgs(process.argv.slice(2)),
  });
  if (!plan.manageServers) {
    await Promise.all([
      assertUrlAvailable(`${plan.backendUrl}/api/health/ready`),
      assertUrlAvailable(plan.webUrl),
    ]);
    return waitForProcessExit(startProcess(plan.playwright));
  }
  await Promise.all([
    assertPortUnused(plan.backendPort),
    assertPortUnused(plan.webPort),
  ]);
  const backend = startProcess(plan.backend);
  const web = startProcess(plan.web);

  try {
    await Promise.all([
      waitForUrl(`${plan.backendUrl}/api/health/ready`, backend),
      waitForUrl(plan.webUrl, web),
    ]);
    const playwright = startProcess(plan.playwright);
    return await waitForProcessExit(playwright);
  } finally {
    await Promise.all([
      stopManagedProcess(web),
      stopManagedProcess(backend),
    ]);
  }
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
