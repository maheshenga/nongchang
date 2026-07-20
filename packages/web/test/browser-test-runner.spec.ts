import { EventEmitter } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as browserTestRunner from '../../../scripts/run-browser-tests';

describe('browser test runner', () => {
  it('cleans a real tracked child when the runner receives SIGTERM', async () => {
    const signalSource = new EventEmitter();
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    const controller = browserTestRunner.createTerminationController(signalSource as never);
    controller.track(child);

    try {
      signalSource.emit('SIGTERM');
      await controller.waitForShutdown();

      expect(controller.exitCode).toBe(143);
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally {
      controller.dispose();
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });

  it('does not spawn when a managed port preflight fails', async () => {
    const plan = browserTestRunner.buildBrowserRunPlan({
      env: {},
      nodeExecutable: 'node-test',
      repoRoot: 'repo-root',
      testArgs: [],
    });
    const startProcess = vi.fn();

    await expect(browserTestRunner.executeBrowserRunPlan(plan, {
      signalSource: new EventEmitter() as never,
      assertPortUnused: vi.fn().mockRejectedValue(new Error('occupied port')),
      startProcess,
    })).rejects.toThrow('occupied port');
    expect(startProcess).not.toHaveBeenCalled();
  });

  it('does not spawn when an external reuse target is unavailable', async () => {
    const plan = browserTestRunner.buildBrowserRunPlan({
      env: { E2E_REUSE_SERVERS: 'true' },
      nodeExecutable: 'node-test',
      repoRoot: 'repo-root',
      testArgs: [],
    });
    const startProcess = vi.fn();

    await expect(browserTestRunner.executeBrowserRunPlan(plan, {
      signalSource: new EventEmitter() as never,
      assertUrlAvailable: vi.fn().mockRejectedValue(new Error('external unavailable')),
      startProcess,
    })).rejects.toThrow('external unavailable');
    expect(startProcess).not.toHaveBeenCalled();
  });

  it('reports a managed child exit as a possible port race', async () => {
    await expect(browserTestRunner.waitForManagedUrl(
      'http://127.0.0.1:3201/api/health/ready',
      { exitCode: 1, signalCode: null } as never,
      25,
    )).rejects.toThrow(/port may have been claimed after preflight/);
  });

  it('requires an external reuse target to be available', async () => {
    const server = createHttpServer((_request, response) => response.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP test port');
    const url = `http://127.0.0.1:${address.port}`;

    await expect(browserTestRunner.assertUrlAvailable(url)).resolves.toBeUndefined();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await expect(browserTestRunner.assertUrlAvailable(url)).rejects.toThrow(
      `Existing server is not available at ${url}`,
    );
  });

  it('rejects an occupied managed server port', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test port');

    try {
      await expect(browserTestRunner.assertPortUnused(address.port)).rejects.toThrow(
        `Port ${address.port} is already in use`,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('removes pnpm argument forwarding delimiters', () => {
    expect(browserTestRunner.normalizeTestArgs(['--', '--list'])).toEqual(['--list']);
    expect(browserTestRunner.normalizeTestArgs(['--grep', '@a11y'])).toEqual(['--grep', '@a11y']);
  });

  it('starts managed servers directly and makes Playwright reuse them', () => {
    const plan = browserTestRunner.buildBrowserRunPlan({
      env: {
        E2E_BACKEND_PORT: '3201',
        E2E_WEB_PORT: '4275',
      },
      nodeExecutable: 'node-test',
      repoRoot: 'repo-root',
      testArgs: ['--grep-invert', '@a11y'],
    });

    expect(plan.backend).toMatchObject({
      command: 'node-test',
      args: ['packages/backend/dist/src/main.js'],
      cwd: 'repo-root',
      env: { PORT: '3201', NODE_ENV: 'test' },
    });
    expect(plan.web).toMatchObject({
      command: 'node-test',
      cwd: 'repo-root',
      env: { WEB_API_PROXY_TARGET: 'http://127.0.0.1:3201' },
    });
    expect(plan.playwright).toMatchObject({
      command: 'node-test',
      args: [
        path.join('repo-root', 'node_modules', '@playwright', 'test', 'cli.js'),
        'test',
        '--grep-invert',
        '@a11y',
      ],
      cwd: 'repo-root',
      env: {
        E2E_BACKEND_PORT: '3201',
        E2E_WEB_PORT: '4275',
        E2E_REUSE_SERVERS: 'true',
      },
    });
    expect(plan.manageServers).toBe(true);
  });

  it('preserves the explicit external server reuse mode', () => {
    const plan = browserTestRunner.buildBrowserRunPlan({
      env: { E2E_REUSE_SERVERS: 'true' },
      nodeExecutable: 'node-test',
      repoRoot: 'repo-root',
      testArgs: [],
    });

    expect(plan.manageServers).toBe(false);
    expect(plan.playwright.env.E2E_REUSE_SERVERS).toBe('true');
  });

  it('stops a managed direct child without taskkill', async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn(),
    });
    child.kill.mockImplementation(() => {
      child.signalCode = 'SIGTERM';
      queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
      return true;
    });

    await browserTestRunner.stopManagedProcess(child as never, 50);

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});
