# Full Hardening Release 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound public read paths, move anti-fake aggregation into PostgreSQL, runtime-validate priority client responses, replace the custom web cache with TanStack Query, split the named large components, and add browser/accessibility release gates.

**Architecture:** Public trace static data is cached behind a small adapter while scan counters/details stay live; the adapter is intentionally replaceable by Redis in Release 4. Anti-fake alerts are one parameterized aggregate query with database-enforced scope and deterministic Top-N. Shared Zod schemas own response contracts, web data fetching is centralized in one QueryClient, and browser tests run against seeded local PostgreSQL through the real backend and Vite app.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL/PostGIS, Zod, React 19, TanStack Query 5, Taro 4, Vitest, Playwright, axe-core.

## Global Constraints

- Preserve miniapp bearer-token and web HttpOnly refresh-cookie compatibility.
- Keep tenant and owner scope fail-closed.
- Never cache or log scan IP/user-agent details, credentials, AI content, authorization headers, cookies, or payment payloads.
- Scan count increments and scan-detail writes stay live on every public request.
- Use `corepack pnpm@10.33.2` for installation and verification.
- Every behavior change starts with a failing focused test and ends with a green focused test.
- Every task ends with an independently reviewable commit.

---

### Task 1: Bound and cache public trace static data

**Files:**
- Modify: `packages/shared/src/dto/public-trace.dto.ts`
- Create: `packages/backend/src/modules/public-trace/public-trace-cache.service.ts`
- Create: `packages/backend/src/modules/public-trace/public-trace-cache.service.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.model.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.module.ts`
- Modify: mutation services under `trace`, `trace-credential`, `batch`, `field`, and `agent`
- Modify: `packages/backend/test/public-trace.e2e-spec.ts`

**Interfaces:**
- Produces `PUBLIC_TRACE_EVENT_LIMIT = 100`, `PUBLIC_TRACE_CREDENTIAL_LIMIT = 20`, and `PUBLIC_TRACE_CACHE_TTL_MS = 30_000`.
- Produces `PublicTraceCacheService.get(code)`, `.set(code, tenantId, batchId, value)`, `.invalidateBatch(batchId)`, and `.invalidateTenant(tenantId)`.
- Adds `eventTotal` and `credentialTotal` to open public trace responses.

- [ ] **Step 1: Write failing model/service tests**

Assert that event and credential queries use `take`, counts run in parallel, totals are returned, a second request reuses static data while still incrementing `scanCount` and writing `TraceScan`, and mutation invalidation forces a fresh static read.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace
```

Expected: failures for missing limits, totals, and cache behavior.

- [ ] **Step 3: Implement the bounded cache adapter**

Use a `Map<string, { expiresAt: number; tenantId: string; batchId: string; value: PublicTraceStaticResult }>` and delete expired entries on read. Cache only the sanitized static response without `scanCount`; merge the live incremented count immediately before returning.

- [ ] **Step 4: Add explicit invalidation**

After successful event/credential/batch/field/agent mutations, invalidate the affected batch or tenant. Do not invalidate before the database mutation commits.

- [ ] **Step 5: Verify and commit**

Run focused unit tests and `test/public-trace.e2e-spec.ts` against PostGIS.

Commit: `feat(trace): bound and cache public trace reads`

### Task 2: Aggregate anti-fake alerts in PostgreSQL

**Files:**
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.model.ts`
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.service.ts`
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`
- Modify: `packages/backend/test/anti-fake.e2e-spec.ts`
- Create: `packages/backend/prisma/migrations/20260713140000_trace_scan_alert_index/migration.sql`

**Interfaces:**
- Produces `AntiFakeAlertQuery { windowMinutes?: number; minScans?: number; minDistinctIps?: number; limit?: number }` with validated bounds.
- `listAlerts(user, query)` returns at most `limit` rows ordered by `scanCount DESC, distinctIps DESC, code ASC`.

- [ ] **Step 1: Write failing SQL-shape and result tests**

Assert `$queryRaw` is used instead of `traceScan.findMany`, merchant/agent scope is represented in SQL parameters, thresholds and limit are bounded, bigint counts are converted to numbers, and ties order by code.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/anti-fake
```

Expected: existing in-memory aggregation calls `findMany` and fails the new assertions.

- [ ] **Step 3: Implement one parameterized aggregate query**

Use Prisma tagged SQL, join `trace_scans`, `batches`, `users`, and `trace_codes`, apply tenant plus owner/agent scope, group by code/status, apply `HAVING COUNT(*)` and `COUNT(DISTINCT ip)`, and apply deterministic order/limit in SQL.

- [ ] **Step 4: Add matching index and E2E**

Create `trace_scans_tenant_scanned_code_ip_idx` on `(tenant_id, scanned_at DESC, code, ip)` and prove thresholds, scope, and Top-N against PostgreSQL.

- [ ] **Step 5: Verify and commit**

Commit: `perf(anti-fake): aggregate alerts in postgres`

### Task 3: Runtime-validate priority API responses

**Files:**
- Modify/create shared schemas in `packages/shared/src/dto/*.dto.ts`
- Create: `packages/web/src/api/parse-response.ts`
- Create: `packages/miniapp/src/api/parse-response.ts`
- Modify priority web APIs: `auth.ts`, `ai.ts`, `billing.ts`, `supply.ts`, `user-group.ts`, `quick-template.ts`, `integration.ts`, `oss-config.ts`, `uploads.ts`, `phenology.ts`
- Modify corresponding miniapp APIs where present: `auth.ts`, `ai.ts`, `billing.ts`, `quickTemplate.ts`
- Add/modify adjacent `*.spec.ts` files

**Interfaces:**
- Produces `parseResponse(schema, value, label)` that accepts `unknown`, calls `schema.parse`, and throws an error identifying the API label without echoing payload content.
- Generic `request` helpers remain transport-only and return `unknown` to parsing wrappers.

- [ ] **Step 1: Add failing malformed-response tests per priority module**

Each wrapper test mocks transport with a structurally invalid body and expects a Zod parse failure; valid fixtures continue to pass.

- [ ] **Step 2: Verify RED**

Run web and miniapp API tests. Expected: wrappers currently trust `request<T>` and accept malformed bodies.

- [ ] **Step 3: Complete shared schemas and parse wrappers**

Export schemas for every returned view/list/mutation result and parse `await request<unknown>(...)` at the API module boundary.

- [ ] **Step 4: Verify and commit**

Commit: `feat(api): validate priority response contracts`

### Task 4: Replace the custom web cache with TanStack Query

**Files:**
- Modify: `packages/web/package.json`
- Create: `packages/web/src/query/query-client.ts`
- Modify: `packages/web/src/main.tsx`
- Rewrite: `packages/web/src/hooks/useApi.ts`
- Modify: `packages/web/src/hooks/useApi.spec.tsx`
- Modify: `packages/web/src/auth/auth-context.tsx`
- Modify: `packages/web/src/auth/auth-context.spec.tsx`

**Interfaces:**
- Produces one `queryClient` with explicit retry/stale/gc policies.
- Preserves `useApi(fetcher, { cacheKey, ttl }) -> { data, loading, error, reload }` during migration while implementing it with `useQuery`.
- Clears all queries when user/tenant/session identity changes or expires.

- [ ] **Step 1: Install dependency and write failing provider/cache tests**

```powershell
corepack pnpm@10.33.2 --filter web add @tanstack/react-query@^5
```

Tests prove same query key deduplicates, reload invalidates/refetches, different keys do not share data, and logout/session expiry clears the cache.

- [ ] **Step 2: Verify RED**

Run `src/hooks/useApi.spec.tsx` and `src/auth/auth-context.spec.tsx` before rewriting the hook.

- [ ] **Step 3: Implement QueryClientProvider and compatibility hook**

Use query keys `['api', cacheKey]`; disable retries for 4xx errors; use `staleTime=ttl`; use `queryClient.invalidateQueries` for reload. Keep module-level fetchers stable and avoid effect-driven duplicate requests.

- [ ] **Step 4: Clear cache on identity boundaries**

Call `queryClient.clear()` in local session cleanup and before accepting a different tenant/user identity.

- [ ] **Step 5: Verify and commit**

Commit: `refactor(web): move api caching to tanstack query`

### Task 5: Split the named large frontend components

**Files:**
- Split `packages/web/src/components/AiAssistant.tsx` into focused panels/hooks under `packages/web/src/components/ai-assistant/`
- Split `packages/web/src/App.tsx` into routing/navigation/shell modules under `packages/web/src/app/`
- Split `packages/miniapp/src/pages/me/index.tsx` into profile/stats/fields/security components and hooks under `packages/miniapp/src/pages/me/`
- Modify adjacent component tests and add focused tests for extracted units

**Interfaces:**
- `AiAssistant`, `App`, and `Me` remain their public entry components.
- Rendered copy, navigation IDs, role boundaries, API payloads, and route behavior remain unchanged.

- [ ] **Step 1: Add focused characterization tests**

Cover AI panel independence, App public/auth/admin route boundaries, and Me profile/password/field actions before moving code.

- [ ] **Step 2: Verify characterization tests pass, then make one extraction fail at a time**

Change imports to the wished-for extracted module, observe the missing-module failure, then add the minimal extracted component/hook.

- [ ] **Step 3: Apply React performance rules**

Keep components module-level, parallelize independent loads, avoid derived state effects, use stable primitive dependencies, and preserve lazy imports for heavy admin views.

- [ ] **Step 4: Verify and commit**

Run all web/miniapp tests, typecheck, and production builds.

Commit: `refactor(frontend): split app ai and profile boundaries`

### Task 6: Add Playwright and axe release gates

**Files:**
- Modify: root `package.json`
- Create: `playwright.config.ts`
- Create: `e2e/web/*.spec.ts`
- Create: `e2e/web/fixtures.ts`
- Modify: `docs/ops/production-verification.md`

**Interfaces:**
- Adds `test:browser` and `test:accessibility` scripts.
- CI artifacts use screenshot, trace, and video only on first retry/failure.

- [ ] **Step 1: Install test dependencies and write the first failing landing/login test**

```powershell
corepack pnpm@10.33.2 add -Dw @playwright/test@^1 @axe-core/playwright@^4
```

Run the landing/login spec before configuration; expected failure is missing server/configuration.

- [ ] **Step 2: Configure real backend and Vite servers**

Use the prepared PostGIS database, deterministic seed accounts, `reuseExistingServer: false` in CI, and failure-only artifacts. Never write credentials into traces or committed fixtures.

- [ ] **Step 3: Add critical flows**

Cover landing/login, field creation, batch creation, farm-record creation, trace-code generation/public scan, billing purchase start, logout, and role-restricted navigation.

- [ ] **Step 4: Add axe assertions**

Run axe on public landing, login, and the primary authenticated admin surface with zero serious/critical violations.

- [ ] **Step 5: Run the Release 3 gate and commit**

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 verify:production
corepack pnpm@10.33.2 test:browser
corepack pnpm@10.33.2 test:accessibility
```

Commit: `test(web): add browser and accessibility gates`

## Self-Review

- Spec coverage: bounded collections/totals/cache/invalidation, SQL aggregation/index/scope/Top-N, all priority response contracts, TanStack Query and identity clearing, all three named component splits, critical Playwright flows, axe, and failure-only artifacts are assigned.
- Placeholder scan: no deferred implementation step is present; every task has files, interfaces, RED/GREEN commands, and a commit boundary.
- Type consistency: the cache adapter owns sanitized static results; public DTO owns limits/totals; API parsers accept `unknown`; `useApi` preserves its current result contract during migration.
