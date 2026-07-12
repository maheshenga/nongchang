# Project Hardening Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a secure release baseline by removing critical/high production advisories, rejecting invalid miniapp production configuration, enforcing complete CI gates, and moving web refresh tokens into HttpOnly cookies.

**Architecture:** Keep the existing bearer-token endpoints for the miniapp and add web-specific cookie endpoints. Treat audit/build commands as executable release contracts, and keep miniapp environment validation in a pure helper that can run before Taro compilation.

**Tech Stack:** pnpm 10.33.2, NestJS 10, React 19, Taro 4, Vitest, ESLint 10, GitHub Actions.

## Global Constraints

- Node.js must remain `>=20` and the package manager must remain `pnpm@10.33.2`.
- Existing `/api/auth/login` and `/api/auth/refresh` behavior must remain compatible with the miniapp.
- Web refresh tokens must never be written to `localStorage`, `sessionStorage`, IndexedDB, or a JavaScript-readable cookie.
- Production miniapp builds require HTTPS API configuration and a WeChat AppID matching `^wx[0-9A-Za-z]{16}$`.
- `pnpm audit --prod --audit-level high` must report zero critical and zero high findings.
- No advisory may be muted or ignored.

---

## File Structure

- `package.json`: root build, lint, audit, and verification commands plus security overrides.
- `pnpm-lock.yaml`: resolved patched transitive dependencies.
- `packages/backend/src/common/upload/upload-limits.ts`: shared hardened Multer limits.
- `packages/backend/src/common/upload/upload-limits.spec.ts`: upload-limit contract tests.
- `packages/miniapp/config/production-env.ts`: pure production miniapp environment validator.
- `packages/miniapp/config/production-env.spec.ts`: validator tests.
- `packages/backend/src/auth/web-session.ts`: web refresh-cookie parsing and serialization.
- `packages/backend/src/auth/web-session.spec.ts`: cookie contract tests.
- `packages/backend/src/auth/auth.controller.ts`: web login/refresh/logout endpoints.
- `packages/backend/src/auth/auth.controller.spec.ts`: controller cookie behavior.
- `packages/shared/src/dto/auth.dto.ts`: web access-token response contract.
- `packages/web/src/auth/token-store.ts`: memory-only access-token store.
- `packages/web/src/api/auth.ts`: web login/logout calls.
- `packages/web/src/api/request.ts`: cookie refresh and access-token retry.
- `packages/web/src/auth/auth-context.tsx`: bootstrap refresh and web logout lifecycle.
- `.github/workflows/ci.yml`: unified production gates.
- `docs/deploy/baota.md`: cookie/static-site security headers and deployment checks.

### Task 1: Patch critical and high dependency paths

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/backend/src/common/upload/upload-limits.ts`
- Create: `packages/backend/src/common/upload/upload-limits.spec.ts`
- Modify: `packages/backend/src/modules/upload/upload.controller.ts`
- Modify: `packages/backend/src/modules/ai/ai.controller.ts`

**Interfaces:**
- Produces: `MULTIPART_FILE_LIMITS` for every `FileInterceptor`.
- Produces: root `pnpm.overrides` resolving Multer to `2.2.0`, Swiper to `12.1.2`, and vulnerable Glob 10.x to `10.5.0`.

- [ ] **Step 1: Capture the failing security gate**

Run:

```powershell
corepack pnpm@10.33.2 audit --prod --audit-level high
```

Expected: exit `1`, reporting one critical and five high vulnerabilities, including `swiper@11.1.15` and `multer@2.0.2`.

- [ ] **Step 2: Write the failing upload-limit test**

Create `packages/backend/src/common/upload/upload-limits.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MULTIPART_FILE_LIMITS } from './upload-limits';

describe('MULTIPART_FILE_LIMITS', () => {
  it('limits uploads to one file and prevents nested multipart fields', () => {
    expect(MULTIPART_FILE_LIMITS).toMatchObject({
      files: 1,
      fields: 0,
      fieldNestingDepth: 1,
    });
  });
});
```

- [ ] **Step 3: Verify the test fails for the missing module**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/upload/upload-limits.spec.ts
```

Expected: FAIL because `./upload-limits` does not exist.

- [ ] **Step 4: Add patched overrides and hardened limits**

Add to root `package.json`:

```json
"pnpm": {
  "overrides": {
    "multer": "2.2.0",
    "swiper": "12.1.2",
    "glob@10.4.5": "10.5.0"
  }
}
```

Create `packages/backend/src/common/upload/upload-limits.ts`:

```ts
export const MULTIPART_FILE_LIMITS = {
  files: 1,
  fields: 0,
  fieldNestingDepth: 1,
} as const;
```

Compose the existing endpoint-specific `fileSize` values with this constant:

```ts
limits: { ...MULTIPART_FILE_LIMITS, fileSize: 5 * 1024 * 1024 }
```

and:

```ts
limits: { ...MULTIPART_FILE_LIMITS, fileSize: 10 * 1024 * 1024 }
```

- [ ] **Step 5: Resolve and verify patched dependencies**

Run:

```powershell
corepack pnpm@10.33.2 install
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/upload/upload-limits.spec.ts src/modules/upload/upload.controller.spec.ts
corepack pnpm@10.33.2 why multer swiper glob --recursive
corepack pnpm@10.33.2 audit --prod --audit-level high
```

Expected: tests PASS; Multer resolves to `2.2.0`; Swiper resolves to `12.1.2`; vulnerable Glob 10.x resolves to `10.5.0`; audit exits `0` with no critical/high findings.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml packages/backend/src/common/upload packages/backend/src/modules/upload/upload.controller.ts packages/backend/src/modules/ai/ai.controller.ts
git commit -m "fix: patch critical upload and miniapp dependencies"
```

### Task 2: Make miniapp production configuration fail fast

**Files:**
- Create: `packages/miniapp/config/production-env.ts`
- Create: `packages/miniapp/config/production-env.spec.ts`
- Modify: `packages/miniapp/config/prod.ts`

**Interfaces:**
- Produces: `resolveProductionMiniappEnv(env: NodeJS.ProcessEnv): { apiUrl: string; wxAppId: string }`.

- [ ] **Step 1: Write validator tests**

Create `packages/miniapp/config/production-env.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveProductionMiniappEnv } from './production-env';

describe('resolveProductionMiniappEnv', () => {
  it.each([
    [{}, 'TARO_APP_API'],
    [{ TARO_APP_API: 'http://api.example.com/api', TARO_APP_WX_APPID: 'wx0000000000000000' }, 'HTTPS'],
    [{ TARO_APP_API: 'https://REPLACE_ME.example.com/api', TARO_APP_WX_APPID: 'wx0000000000000000' }, 'placeholder'],
    [{ TARO_APP_API: 'https://api.example.com/v1', TARO_APP_WX_APPID: 'wx0000000000000000' }, '/api'],
    [{ TARO_APP_API: 'https://api.example.com/api', TARO_APP_WX_APPID: '' }, 'TARO_APP_WX_APPID'],
  ])('rejects invalid production environment %#', (env, message) => {
    expect(() => resolveProductionMiniappEnv(env)).toThrow(message);
  });

  it('returns normalized production values', () => {
    expect(resolveProductionMiniappEnv({
      TARO_APP_API: 'https://api.example.com/api/',
      TARO_APP_WX_APPID: 'wx0000000000000000',
    })).toEqual({
      apiUrl: 'https://api.example.com/api',
      wxAppId: 'wx0000000000000000',
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run config/production-env.spec.ts
```

Expected: FAIL because `production-env.ts` does not exist.

- [ ] **Step 3: Implement the pure validator**

Create `packages/miniapp/config/production-env.ts`:

```ts
const WX_APP_ID = /^wx[0-9A-Za-z]{16}$/;

export function resolveProductionMiniappEnv(env: NodeJS.ProcessEnv): { apiUrl: string; wxAppId: string } {
  const rawApi = env.TARO_APP_API?.trim();
  if (!rawApi) throw new Error('TARO_APP_API is required for a production miniapp build');
  let url: URL;
  try {
    url = new URL(rawApi);
  } catch {
    throw new Error('TARO_APP_API must be a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('TARO_APP_API must use HTTPS');
  if (url.hostname.toUpperCase().includes('REPLACE_ME')) throw new Error('TARO_APP_API contains a placeholder hostname');
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api')) throw new Error('TARO_APP_API pathname must end with /api');

  const wxAppId = env.TARO_APP_WX_APPID?.trim() ?? '';
  if (!WX_APP_ID.test(wxAppId)) throw new Error('TARO_APP_WX_APPID must be a valid WeChat AppID');
  return { apiUrl: `${url.origin}${pathname}`, wxAppId };
}
```

Update `config/prod.ts` to call the helper once and remove all fallbacks.

- [ ] **Step 4: Verify tests and build failure/success behavior**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run config/production-env.spec.ts
Remove-Item Env:TARO_APP_API -ErrorAction SilentlyContinue
Remove-Item Env:TARO_APP_WX_APPID -ErrorAction SilentlyContinue
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
```

Expected: tests PASS; production build exits non-zero naming `TARO_APP_API`.

Then run:

```powershell
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
rg "REPLACE_ME\.example\.com" packages/miniapp/dist
```

Expected: build PASS; `rg` returns no matches.

- [ ] **Step 5: Commit**

```powershell
git add packages/miniapp/config
git commit -m "fix: fail miniapp builds on invalid production config"
```

### Task 3: Unify production scripts and CI gates

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/web/src/components/BatchAdmin.model.spec.ts`
- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
- Modify: `docs/ops/production-verification.md`

**Interfaces:**
- Produces: `lint`, `typecheck:web`, `build:web`, `build:miniapp`, `audit:prod`, `verify:local`, and `verify:production` root scripts.

- [ ] **Step 1: Capture current gate omissions**

Run:

```powershell
node -e "const p=require('./package.json'); if(/build:weapp/.test(p.scripts['verify:local']||'') && /vite build/.test(p.scripts['verify:local']||'')) process.exit(0); process.exit(1)"
```

Expected: exit `1` because `verify:local` does not build web or miniapp.

- [ ] **Step 2: Make ESLint warning-free**

Remove the two unused Node URL imports from `BatchAdmin.model.spec.ts` and the unused `container` assignments from `MerchantAdmin.actions.spec.tsx`.

Run:

```powershell
corepack pnpm@10.33.2 exec eslint packages/backend/src packages/shared/src packages/web/src packages/miniapp/src --max-warnings=0
```

Expected: PASS with zero warnings.

- [ ] **Step 3: Add complete root scripts**

Set the root scripts to include these commands:

```json
"lint": "eslint packages/backend/src packages/shared/src packages/web/src packages/miniapp/src --max-warnings=0",
"typecheck:web": "pnpm --filter web lint",
"build:web": "pnpm --filter web build",
"build:miniapp": "pnpm --filter @nongchang/miniapp build:weapp",
"audit:prod": "pnpm audit --prod --audit-level high",
"verify:local": "pnpm build:shared && pnpm build:backend && pnpm typecheck:web && pnpm lint && pnpm test:unit && pnpm build:web && pnpm build:miniapp && pnpm audit:prod",
"verify:production": "pnpm verify:local && pnpm test:e2e"
```

Keep the existing individual package scripts; remove duplicate shared/backend work only when command output proves the resulting order still builds shared before consumers.

- [ ] **Step 4: Make CI call the root contract**

Set job-level miniapp environment values:

```yaml
TARO_APP_API: https://api.ci.invalid/api
TARO_APP_WX_APPID: wx0000000000000000
```

Retain database migration and seed preparation, then replace the non-E2E and E2E command pair with:

```yaml
- name: Full production verification
  env:
    DATABASE_URL: postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public
  run: pnpm verify:production
```

- [ ] **Step 5: Verify the local non-E2E contract**

Run:

```powershell
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
$env:DATABASE_URL='postgresql://unit:unit@127.0.0.1:1/unit?schema=public'
corepack pnpm@10.33.2 verify:local
```

Expected: exit `0`; shared/backend/web/miniapp builds, ESLint, 926+ unit tests, and audit all pass.

- [ ] **Step 6: Update verification documentation and commit**

Document the required miniapp variables and the expanded gate in `docs/ops/production-verification.md`.

```powershell
git add package.json .github/workflows/ci.yml packages/web/src/components/BatchAdmin.model.spec.ts packages/web/src/components/MerchantAdmin.actions.spec.tsx docs/ops/production-verification.md
git commit -m "ci: verify every production artifact"
```

### Task 4: Add backend web-cookie session endpoints

**Files:**
- Modify: `packages/shared/src/dto/auth.dto.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/backend/src/auth/web-session.ts`
- Create: `packages/backend/src/auth/web-session.spec.ts`
- Modify: `packages/backend/src/auth/auth.controller.ts`
- Create: `packages/backend/src/auth/auth.controller.spec.ts`
- Modify: `packages/backend/package.json`

**Interfaces:**
- Produces: `WebAccessTokenResponse = { accessToken: string }`.
- Produces: `parseWebRefreshCookie`, `setWebRefreshCookie`, and `clearWebRefreshCookie`.
- Produces: `/auth/web/login`, `/auth/web/refresh`, and `/auth/web/logout`.

- [ ] **Step 1: Write cookie-helper tests**

Create tests proving that serialization includes `HttpOnly`, `SameSite=Strict`, seven-day `Max-Age`, the `/api/auth/web` path, and production-only `Secure`; parsing must decode the named cookie and ignore malformed unrelated cookies.

Use this core assertion:

```ts
expect(buildWebRefreshCookie('a.b.c', true)).toContain(
  'nc_refresh=a.b.c; Path=/api/auth/web; HttpOnly; Secure; SameSite=Strict; Max-Age=604800',
);
```

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/web-session.spec.ts
```

Expected: FAIL because `web-session.ts` does not exist.

- [ ] **Step 3: Implement the cookie helper and shared response type**

Implement:

```ts
export const WEB_REFRESH_COOKIE = 'nc_refresh';
export const WEB_REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function buildWebRefreshCookie(token: string, secure: boolean): string;
export function buildExpiredWebRefreshCookie(secure: boolean): string;
export function parseWebRefreshCookie(cookieHeader: string | undefined): string | null;
```

Add the shared schema:

```ts
export const webAccessTokenResponseSchema = z.object({ accessToken: z.string().min(1) });
export type WebAccessTokenResponse = z.infer<typeof webAccessTokenResponseSchema>;
```

- [ ] **Step 4: Write controller tests before adding routes**

Create `auth.controller.spec.ts` with a mocked `AuthService`. Test that web login and refresh return only the access token, write a refresh cookie, and never include the refresh token in the response. Test that logout writes an expired cookie and returns no body.

The response stub must expose:

```ts
const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() };
```

- [ ] **Step 5: Verify controller RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.controller.spec.ts
```

Expected: FAIL because the three web methods do not exist.

- [ ] **Step 6: Add web routes without changing miniapp routes**

Use Express request/response types and passthrough response handling. Web login calls the existing `AuthService.login`, web refresh calls the existing `AuthService.refresh`, and both convert `TokenPair` to `{ accessToken }` after setting the cookie. Web logout expires the cookie and returns `undefined` with HTTP `204`.

Add `@types/express` as an explicit backend dev dependency if TypeScript resolution requires it.

- [ ] **Step 7: Verify and commit**

```powershell
corepack pnpm@10.33.2 build:shared
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/web-session.spec.ts src/auth/auth.controller.spec.ts src/auth/auth.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
git add packages/shared/src packages/backend/src/auth packages/backend/package.json pnpm-lock.yaml
git commit -m "feat: add HttpOnly web refresh sessions"
```

Expected: all tests and build PASS.

### Task 5: Move the web client to memory-only access tokens

**Files:**
- Modify: `packages/web/src/auth/token-store.ts`
- Modify: `packages/web/src/auth/token-store.spec.ts`
- Modify: `packages/web/src/api/auth.ts`
- Modify: `packages/web/src/api/request.ts`
- Modify: `packages/web/src/api/request.spec.ts`
- Modify: `packages/web/src/auth/auth-context.tsx`
- Modify: `packages/web/src/auth/auth-context.spec.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `packages/web/src/components/ProfileSettings.tsx`
- Modify: `packages/web/src/components/ProfileSettings.spec.tsx`

**Interfaces:**
- Produces: `getAccessToken`, `setAccessToken`, and `clearAccessToken` using module memory.
- Produces: `webLogin(dto): Promise<WebAccessTokenResponse>` and `webLogout(): Promise<void>`.
- Produces: `AuthContextValue.isReady` for bootstrap-session completion.

- [ ] **Step 1: Replace token-store tests with the desired security behavior**

Tests must prove:

```ts
setAccessToken('a.b.c');
expect(getAccessToken()).toBe('a.b.c');
expect(localStorage.length).toBe(0);
clearAccessToken();
expect(getAccessToken()).toBeNull();
```

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/auth/token-store.spec.ts
```

Expected: FAIL because the old store writes both tokens to localStorage.

- [ ] **Step 3: Implement memory-only storage and cookie refresh**

Replace the token store with:

```ts
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (next: string) => { accessToken = next; };
export const clearAccessToken = () => { accessToken = null; };
```

Change request refresh to:

```ts
const res = await fetch('/api/auth/web/refresh', {
  method: 'POST',
  credentials: 'same-origin',
});
```

Parse `WebAccessTokenResponse`, store only the access token, and retain the existing single-flight refresh promise.

- [ ] **Step 4: Write API and context tests for web bootstrap**

Add tests proving:

- login calls `/api/auth/web/login` with `credentials: 'same-origin'`;
- logout calls `/api/auth/web/logout` and clears memory even if the network call fails;
- `AuthProvider` starts with `isReady=false`, attempts cookie refresh once, then exposes the decoded user and `isReady=true`;
- a failed bootstrap refresh produces an unauthenticated ready state;
- a 401 retries exactly once after cookie refresh;
- no test observes `nc_refresh_token` or `nc_access_token` in localStorage.

- [ ] **Step 5: Verify RED for client lifecycle**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/api/request.spec.ts src/auth/auth-context.spec.tsx src/App.spec.tsx
```

Expected: FAIL because the old endpoints and persisted token pair are still used.

- [ ] **Step 6: Implement web login, bootstrap, logout, and password-change revocation**

Update `AuthProvider` to decode access tokens from memory, expose `isReady`, and call an exported `refreshWebSession()` on mount. `App` must render the existing skeleton while `isReady` is false. Profile password change must await the change, invoke logout, and require a fresh login.

- [ ] **Step 7: Verify and commit**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/auth/token-store.spec.ts src/api/request.spec.ts src/auth/auth-context.spec.tsx src/App.spec.tsx src/components/ProfileSettings.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
rg "localStorage\.(setItem|getItem).*nc_(access|refresh)_token" packages/web/src
git add packages/web/src
git commit -m "feat: keep web sessions out of localStorage"
```

Expected: tests/typecheck/build PASS; `rg` finds no token persistence.

### Task 6: Add deployment security headers and run the Stage A gate

**Files:**
- Modify: `docs/deploy/baota.md`

**Interfaces:**
- Produces: documented Nginx security-header configuration compatible with the built web application.

- [ ] **Step 1: Add Nginx header documentation**

Document an exact same-origin policy including:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https:; connect-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self' https://*.alipay.com https://*.alipaydev.com" always;
```

Keep `script-src 'self'` without `'unsafe-inline'`; the existing `application/ld+json` data block is non-executable and the production smoke check must confirm that application scripts and payment redirects continue to work under the documented policy.

- [ ] **Step 2: Run the complete Stage A verification**

```powershell
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
$env:DATABASE_URL='postgresql://unit:unit@127.0.0.1:1/unit?schema=public'
corepack pnpm@10.33.2 verify:local
corepack pnpm@10.33.2 audit --prod --audit-level high
git status --short
```

Expected: both commands exit `0`; Git status contains only the intended documentation change before commit.

- [ ] **Step 3: Commit**

```powershell
git add docs/deploy/baota.md
git commit -m "docs: harden web deployment headers"
```
