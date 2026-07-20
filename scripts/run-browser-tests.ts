import { spawn, type ChildProcess } from 'node:child_process';
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

interface SignalSource {
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

interface BrowserRunDependencies {
  signalSource?: SignalSource;
  assertPortUnused?: typeof assertPortUnused;
  assertUrlAvailable?: typeof assertUrlAvailable;
  startProcess?: (plan: ProcessPlan) => ChildProcess;
  waitForManagedUrl?: typeof waitForManagedUrl;
}

export interface TerminationController {
  track(child: ChildProcess): void;
  waitForShutdown(): Promise<void>;
  readonly exitCode: number | undefined;
  dispose(): void;
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

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (hasExited(child)) return Promise.resolve();

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      child.off('exit', onExit);
      if (timer) clearTimeout(timer);
    };
    const onExit = () => {
      cleanup();
      resolve();
    };

    child.once('exit', onExit);
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    if (hasExited(child)) onExit();
  });
}

export async function stopManagedProcess(child: ChildProcess, timeoutMs = 5_000): Promise<void> {
  if (hasExited(child)) return;
  const gracefulExit = waitForExit(child, timeoutMs);
  if (hasExited(child)) return;
  child.kill('SIGTERM');
  await gracefulExit;
  if (hasExited(child)) return;
  const forcedExit = waitForExit(child, timeoutMs);
  if (hasExited(child)) return;
  child.kill('SIGKILL');
  await forcedExit;
  if (!hasExited(child)) {
    throw new Error(`Managed process ${child.pid ?? 'unknown'} did not exit`);
  }
}

export function createTerminationController(signalSource: SignalSource): TerminationController {
  const trackedChildren = new Set<ChildProcess>();
  let requestedExitCode: number | undefined;
  let shutdownPromise: Promise<void> | undefined;

  const beginShutdown = (): Promise<void> => {
    if (!shutdownPromise) {
      const children = [...trackedChildren].reverse();
      shutdownPromise = Promise.allSettled(children.map((child) => stopManagedProcess(child)))
        .then((results) => {
          const failures = results
            .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
            .map((result) => result.reason);
          if (failures.length > 0) {
            throw new AggregateError(failures, 'Failed to stop one or more browser test processes');
          }
        });
    }
    return shutdownPromise;
  };

  const onSigint = () => {
    requestedExitCode ??= 130;
    void beginShutdown().catch(() => undefined);
  };
  const onSigterm = () => {
    requestedExitCode ??= 143;
    void beginShutdown().catch(() => undefined);
  };

  signalSource.on('SIGINT', onSigint);
  signalSource.on('SIGTERM', onSigterm);

  return {
    track(child) {
      trackedChildren.add(child);
      if (shutdownPromise && !hasExited(child)) {
        shutdownPromise = shutdownPromise.then(() => stopManagedProcess(child));
      }
    },
    waitForShutdown: beginShutdown,
    get exitCode() {
      return requestedExitCode;
    },
    dispose() {
      signalSource.off('SIGINT', onSigint);
      signalSource.off('SIGTERM', onSigterm);
    },
  };
}

export async function waitForManagedUrl(
  url: string,
  child: ChildProcess,
  timeoutMs = 120_000,
): Promise<void> {
  if (hasExited(child)) {
    throw new Error(
      `Managed process exited before ${url} became ready; port may have been claimed after preflight`,
    );
  }
  const deadline = Date.now() + timeoutMs;
  let spawnError: Error | undefined;
  const onSpawnError = (error: Error) => {
    spawnError = error;
  };
  child.once('error', onSpawnError);
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (hasExited(child)) {
        throw new Error(
          `Managed process exited before ${url} became ready; port may have been claimed after preflight`,
        );
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
  } finally {
    child.off('error', onSpawnError);
  }
}

function waitForProcessExit(child: ChildProcess): Promise<number> {
  if (hasExited(child)) return Promise.resolve(child.exitCode ?? 1);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null) => {
      cleanup();
      resolve(code ?? 1);
    };
    child.once('error', onError);
    child.once('exit', onExit);
    if (hasExited(child)) onExit(child.exitCode);
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

export async function executeBrowserRunPlan(
  plan: BrowserRunPlan,
  dependencies: BrowserRunDependencies = {},
): Promise<number> {
  const signalSource = dependencies.signalSource ?? process;
  const checkPortUnused = dependencies.assertPortUnused ?? assertPortUnused;
  const checkUrlAvailable = dependencies.assertUrlAvailable ?? assertUrlAvailable;
  const spawnProcess = dependencies.startProcess ?? startProcess;
  const waitUntilManagedUrl = dependencies.waitForManagedUrl ?? waitForManagedUrl;
  const termination = createTerminationController(signalSource);
  let resultCode: number | undefined;
  let executionError: unknown;
  let executionFailed = false;
  let cleanupError: unknown;
  let cleanupFailed = false;

  try {
    if (!plan.manageServers) {
      await Promise.all([
        checkUrlAvailable(`${plan.backendUrl}/api/health/ready`),
        checkUrlAvailable(plan.webUrl),
      ]);
      if (termination.exitCode === undefined) {
        const playwright = spawnProcess(plan.playwright);
        termination.track(playwright);
        resultCode = await waitForProcessExit(playwright);
      }
    } else {
      await Promise.all([
        checkPortUnused(plan.backendPort),
        checkPortUnused(plan.webPort),
      ]);
      if (termination.exitCode === undefined) {
        const backend = spawnProcess(plan.backend);
        termination.track(backend);
        const web = spawnProcess(plan.web);
        termination.track(web);

        await Promise.all([
          waitUntilManagedUrl(`${plan.backendUrl}/api/health/ready`, backend),
          waitUntilManagedUrl(plan.webUrl, web),
        ]);
        if (termination.exitCode === undefined) {
          const playwright = spawnProcess(plan.playwright);
          termination.track(playwright);
          resultCode = await waitForProcessExit(playwright);
        }
      }
    }
  } catch (error) {
    if (termination.exitCode === undefined) {
      executionError = error;
      executionFailed = true;
    }
  } finally {
    try {
      await termination.waitForShutdown();
    } catch (error) {
      cleanupError = error;
      cleanupFailed = true;
    } finally {
      termination.dispose();
    }
  }

  if (executionFailed) throw executionError;
  if (cleanupFailed) throw cleanupError;
  return termination.exitCode ?? resultCode ?? 1;
}

async function run(): Promise<number> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const plan = buildBrowserRunPlan({
    env: process.env,
    nodeExecutable: process.execPath,
    repoRoot,
    testArgs: normalizeTestArgs(process.argv.slice(2)),
  });
  return executeBrowserRunPlan(plan);
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
