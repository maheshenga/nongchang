# Browser Test Server Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Playwright runs start and target the current checkout's backend and Web servers deterministically, even when Docker, WSL, or another checkout already occupies the normal development ports.

**Architecture:** Keep the normal Web development proxy default on IPv4 port 3001, but allow Playwright to inject a dedicated backend target. Resolve browser-test ports through a small pure helper, default to isolated ports, and require explicit opt-in before reusing existing services.

**Tech Stack:** TypeScript 5.8, Vite 8, Playwright 1.61, Vitest 4, pnpm 10.

## Global Constraints

- Do not use `using-superpowers`.
- Do not change production API routes, authentication semantics, cookies, tenant scopes, or runtime credentials.
- Do not kill or reconfigure Docker/WSL services; isolate browser tests from them.
- Default Vite development behavior must remain a proxy to the local backend, using `http://127.0.0.1:3001` instead of ambiguous `localhost` resolution.
- Playwright defaults must use backend port `3101` and Web port `4175`.
- `E2E_BACKEND_PORT` and `E2E_WEB_PORT` may override defaults with distinct integers from 1024 through 65535.
- Existing servers are reused only when `E2E_REUSE_SERVERS=true`; the default is false.
- Playwright must inject `WEB_API_PROXY_TARGET=http://127.0.0.1:<backendPort>` into the Vite server process.
- Every production/config behavior change starts with a failing regression test observed for the expected reason.
- No real passwords, tokens, server credentials, or production AppIDs enter source or test artifacts.

---

### Task 1: Deterministic Vite and Playwright server targets

**Files:**
- Create: `packages/web/test/browser-server-config.ts`
- Create: `packages/web/test/browser-server-config.spec.ts`
- Create: `packages/web/vite.config.spec.ts`
- Modify: `packages/web/vite.config.ts:1-35`
- Modify: `playwright.config.ts:1-51`

**Interfaces:**
- Produces: `resolveApiProxyTarget(env: NodeJS.ProcessEnv): string` from `packages/web/vite.config.ts`.
- Produces: `resolveBrowserServerConfig(env: NodeJS.ProcessEnv): BrowserServerConfig`.
- Consumes in Playwright: `backendUrl`, `webUrl`, `backendPort`, `webPort`, and `reuseExistingServer`.

- [ ] **Step 1: Write failing Vite proxy tests**

Create `packages/web/vite.config.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveApiProxyTarget } from './vite.config';

describe('Vite API proxy target', () => {
  it('defaults to the IPv4 backend development address', () => {
    expect(resolveApiProxyTarget({})).toBe('http://127.0.0.1:3001');
  });

  it('uses the browser-test backend target when supplied', () => {
    expect(resolveApiProxyTarget({ WEB_API_PROXY_TARGET: ' http://127.0.0.1:3101 ' }))
      .toBe('http://127.0.0.1:3101');
  });
});
```

- [ ] **Step 2: Write failing browser-server config tests**

Create `packages/web/test/browser-server-config.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveBrowserServerConfig } from './browser-server-config';

describe('browser server isolation', () => {
  it('uses isolated defaults and does not reuse unknown servers', () => {
    expect(resolveBrowserServerConfig({})).toEqual({
      backendPort: 3101,
      webPort: 4175,
      backendUrl: 'http://127.0.0.1:3101',
      webUrl: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
    });
  });

  it('accepts explicit distinct ports and reuse opt-in', () => {
    expect(resolveBrowserServerConfig({
      E2E_BACKEND_PORT: '3201',
      E2E_WEB_PORT: '4275',
      E2E_REUSE_SERVERS: 'true',
    })).toMatchObject({ backendPort: 3201, webPort: 4275, reuseExistingServer: true });
  });

  it.each([
    { E2E_BACKEND_PORT: 'abc' },
    { E2E_WEB_PORT: '70000' },
    { E2E_BACKEND_PORT: '4200', E2E_WEB_PORT: '4200' },
  ])('rejects unsafe port configuration %#', (env) => {
    expect(() => resolveBrowserServerConfig(env)).toThrow();
  });
});
```

- [ ] **Step 3: Run tests and confirm RED**

Run:

```powershell
pnpm.cmd --filter web exec vitest run vite.config.spec.ts test/browser-server-config.spec.ts
```

Expected: FAIL because `resolveApiProxyTarget` and `browser-server-config.ts` do not exist.

- [ ] **Step 4: Implement the pure browser-server resolver**

Create `packages/web/test/browser-server-config.ts`:

```ts
export interface BrowserServerConfig {
  backendPort: number;
  webPort: number;
  backendUrl: string;
  webUrl: string;
  reuseExistingServer: boolean;
}

function readPort(raw: string | undefined, fallback: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer from 1024 through 65535`);
  }
  return value;
}

export function resolveBrowserServerConfig(env: NodeJS.ProcessEnv): BrowserServerConfig {
  const backendPort = readPort(env.E2E_BACKEND_PORT, 3101, 'E2E_BACKEND_PORT');
  const webPort = readPort(env.E2E_WEB_PORT, 4175, 'E2E_WEB_PORT');
  if (backendPort === webPort) throw new Error('E2E_BACKEND_PORT and E2E_WEB_PORT must differ');
  return {
    backendPort,
    webPort,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: env.E2E_REUSE_SERVERS === 'true',
  };
}
```

- [ ] **Step 5: Make the Vite proxy target explicit and injectable**

Add before the default export:

```ts
export function resolveApiProxyTarget(env: NodeJS.ProcessEnv): string {
  return env.WEB_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:3001';
}
```

Replace the proxy target with:

```ts
'/api': { target: resolveApiProxyTarget(process.env), changeOrigin: true },
```

- [ ] **Step 6: Wire Playwright to isolated servers**

Import and resolve the helper once:

```ts
import { resolveBrowserServerConfig } from './packages/web/test/browser-server-config';

const servers = resolveBrowserServerConfig(process.env);
```

Set `backendEnv.PORT = String(servers.backendPort)`, `use.baseURL = servers.webUrl`, the backend readiness URL to `${servers.backendUrl}/api/health/ready`, and the Web command port to `servers.webPort`. Give the Web server this environment:

```ts
env: { ...process.env, WEB_API_PROXY_TARGET: servers.backendUrl },
```

Set both `reuseExistingServer` fields to `servers.reuseExistingServer`.

- [ ] **Step 7: Run unit tests and typechecks**

Run:

```powershell
pnpm.cmd --filter web exec vitest run vite.config.spec.ts test/browser-server-config.spec.ts
pnpm.cmd --filter web lint
pnpm.cmd test:browser:run -- --list
```

Expected: 7 resolver tests pass, Web typecheck passes, and the browser runner lists the tests, starting and tearing down its managed servers when required.

- [ ] **Step 8: Commit deterministic test servers**

```powershell
git add packages/web/vite.config.ts packages/web/vite.config.spec.ts packages/web/test/browser-server-config.ts packages/web/test/browser-server-config.spec.ts playwright.config.ts
git commit -m "fix(e2e): isolate browser test servers"
```

---

### Task 2: Browser verification and final review

**Files:**
- Modify only if browser verification exposes a reproducible regression.

**Interfaces:**
- Consumes: the isolated server configuration from Task 1.
- Produces: fresh browser evidence without depending on existing services.

- [ ] **Step 1: Prepare the browser database**

Run:

```powershell
pnpm.cmd test:browser:prepare
```

Expected: Shared/backend builds, migrations, and idempotent demo seed complete.

- [ ] **Step 2: Run the minimal UI authentication check with runtime-only demo credentials**

Run with `E2E_TENANT_CODE=DEMO`, `E2E_USERNAME=merchantA`, `E2E_PASSWORD` set to the demo-seed password, and `E2E_BILLING_USERNAME=agentA` only in the process environment:

```powershell
pnpm.cmd test:browser:run -- e2e/web/auth-flow.spec.ts --reporter=line
```

Expected: 1 Chromium test passes and both Playwright-managed servers exit.

- [ ] **Step 3: Run all non-accessibility browser flows**

Run:

```powershell
pnpm.cmd test:browser
```

Expected: all non-`@a11y` Chromium tests pass without server reuse or port collision.

- [ ] **Step 4: Review and repository check**

Generate a task review package from the pre-fix commit through `HEAD`, require spec and quality approval, then run:

```powershell
git status --short
git diff --check
```

Expected: review approved and no uncommitted source/test/config files remain.
