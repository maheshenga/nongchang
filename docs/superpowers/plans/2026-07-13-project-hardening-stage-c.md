# Project Hardening Stage C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce public-path database contention, add operational health/logging, eliminate agent-scope ID expansion, and split oversized frontend units behind runtime-validated shared response contracts.

**Architecture:** Keep the current deployment topology and use focused NestJS modules/interceptors rather than external infrastructure. Refactor frontend code by moving existing behavior behind explicit props/hooks, preserving UI copy and lazy bundle boundaries.

**Tech Stack:** NestJS 10, Prisma 5, React 19, Vite 6, Taro 4, Zod 3, Vitest.

## Global Constraints

- Public trace scan-detail failure must not fail the consumer response or roll back `scanCount`.
- Missing `agentId` or `ownerId` must remain fail-closed.
- Request logs must not contain authorization headers, cookies, request/response bodies, AI content, or integration secrets.
- Health endpoints are public and throttled; readiness returns HTTP `503` when PostgreSQL is unavailable.
- `BatchAdmin.tsx` must finish below 500 lines and `DashboardDemo.tsx` below 400 lines.
- Demo dashboard code must remain in a separate lazy production chunk and load only after explicit opt-in.
- Batch, Field, FarmRecord, TraceCode, and TraceEvent response types must come from shared Zod schemas in both clients.

---

## File Structure

- `packages/backend/src/modules/public-trace/public-trace.service.ts`: short public trace read/write flow.
- `packages/backend/src/common/scope/scope.service.ts`: relational owner filters.
- `packages/backend/src/modules/health/*`: liveness/readiness module.
- `packages/backend/src/common/logging/request-logging.interceptor.ts`: structured request completion logs.
- `packages/web/src/components/batch-admin/*`: extracted batch console surfaces and hooks.
- `packages/web/src/components/dashboard-demo/*`: extracted demo scenes, data, and layout hook.
- `packages/shared/src/dto/resource-views.dto.ts`: runtime response schemas.
- Web/miniapp API modules: shared schema parsing at HTTP boundaries.

### Task 1: Remove the long public-trace transaction

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`

**Interfaces:**
- Preserves: `getByCode(code, meta): Promise<PublicTraceResult>`.
- Produces: a response even when `traceScan.create` rejects after the counter update.

- [ ] **Step 1: Write the failing scan-detail isolation test**

Add a test whose Prisma stub makes the trace lookup, reads, and `traceCode.update` succeed but makes `traceScan.create` reject. Assert:

```ts
await expect(service.getByCode('ORC-1', { ip: '127.0.0.1', userAgent: null }))
  .resolves.toMatchObject({ code: 'ORC-1', scanCount: 2 });
expect(prisma.traceCode.update).toHaveBeenCalledTimes(1);
expect(prisma.traceScan.create).toHaveBeenCalledTimes(1);
```

Do not put `traceScan.create` behind a transaction mock in this test.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.service.spec.ts
```

Expected: FAIL because current behavior executes the insert inside the same interactive transaction.

- [ ] **Step 3: Refactor reads and writes**

Implement this order:

```ts
const traceCode = await prisma.traceCode.findUnique({ where: { code } });
const batch = await prisma.batch.findUnique({ where: { id: traceCode.batchId } });
if (traceCode.status === 'frozen') return { code: traceCode.code, frozen: true };

const [field, events, credentials] = await Promise.all([
  prisma.field.findUnique({ where: { id: batch.fieldId } }),
  prisma.traceEvent.findMany({ where: { tenantId: traceCode.tenantId, batchId: batch.id }, orderBy: { occurredAt: 'asc' } }),
  prisma.traceCredential.findMany({ where: { tenantId: traceCode.tenantId, batchId: batch.id }, orderBy: { createdAt: 'desc' } }),
]);
```

Load coordinates and owner/agent/map configuration without an interactive transaction. Atomically increment the counter with `traceCode.update`. Attempt `traceScan.create` in a separate `try/catch` after the update. Return the response built from the updated counter.

Use parameterized `$queryRaw` rather than `$queryRawUnsafe` for the static coordinate query.

- [ ] **Step 4: Verify behavior and regression**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.service.spec.ts src/modules/public-trace/public-trace.model.spec.ts src/modules/public-trace/client-ip.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/backend/src/modules/public-trace
git commit -m "perf: shorten public trace database writes"
```

### Task 2: Replace merchant-ID expansion with relational scope filters

**Files:**
- Modify: `packages/backend/src/common/scope/scope.service.ts`
- Modify: `packages/backend/src/common/scope/scope.service.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.model.ts`
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.service.ts`
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`
- Modify: other callers of `ownedScopeWhere` only where types require adjustment.

**Interfaces:**
- Produces: `ownedEntityWhere(user)` returning a Prisma-compatible owner relation filter without a database query.
- Removes: `merchantIdsForAgent`.

- [ ] **Step 1: Change scope expectations in tests**

For an agent admin, assert:

```ts
expect(service.ownedEntityWhere(agentUser)).toEqual({
  tenantId: agentUser.tenantId,
  owner: {
    is: {
      tenantId: agentUser.tenantId,
      agentId: agentUser.agentId,
      role: 'merchant',
    },
  },
});
expect(prisma.user.findMany).not.toHaveBeenCalled();
```

Retain system-admin `{ tenantId }`, merchant `{ tenantId, ownerId }`, and fail-closed missing-ID tests.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/scope/scope.service.spec.ts
```

Expected: FAIL because current agent scope loads merchant IDs and returns `ownerId: { in: ids }`.

- [ ] **Step 3: Implement relational owner scope**

Add a synchronous helper:

```ts
ownedEntityWhere(user: AuthUser): Record<string, unknown> {
  if (user.role === Role.SYSTEM_ADMIN) return { tenantId: user.tenantId };
  if (user.role === Role.MERCHANT) {
    if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝越权范围查询');
    return { tenantId: user.tenantId, ownerId: user.ownerId };
  }
  if (user.role === Role.AGENT_ADMIN) {
    if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝越权范围查询');
    return {
      tenantId: user.tenantId,
      owner: { is: { tenantId: user.tenantId, agentId: user.agentId, role: Role.MERCHANT } },
    };
  }
  throw new ForbiddenException('未知角色,拒绝范围查询');
}
```

Rewrite `assertOwnerInScope` with a direct `user.findFirst` predicate instead of destructuring the entity filter.

- [ ] **Step 4: Remove batch-ID expansion in farm record and anti-fake queries**

Change farm-record list filters to accept a nested batch scope:

```ts
const where = {
  tenantId: user.tenantId,
  ...(query.batchId ? { batchId: query.batchId } : { batch: { is: scope.ownedEntityWhere(user) } }),
  ...otherFilters,
};
```

Change anti-fake scan filters to use the Stage B `TraceScan.batch` relation:

```ts
return user.role === Role.SYSTEM_ADMIN
  ? { tenantId: user.tenantId }
  : { tenantId: user.tenantId, batch: { is: this.scope.ownedEntityWhere(user) } };
```

Update batch, field, supply, phenology, and AI callers to use `ownedEntityWhere`; existing `await` calls may be removed.

- [ ] **Step 5: Verify scope and service suites**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/scope/scope.service.spec.ts src/modules/farm-record/farm-record.model.spec.ts src/modules/farm-record/farm-record.service.spec.ts src/modules/anti-fake/anti-fake.service.spec.ts src/modules/batch/batch.service.spec.ts src/modules/field/field.service.spec.ts src/modules/supply/supply.service.spec.ts src/modules/ai/ai.service.spec.ts
```

Expected: PASS and no production occurrence of `merchantIdsForAgent`.

- [ ] **Step 6: Commit**

```powershell
git add packages/backend/src/common/scope packages/backend/src/modules
git commit -m "perf: express agent scope as relational filters"
```

### Task 3: Add liveness and readiness endpoints

**Files:**
- Create: `packages/backend/src/modules/health/health.service.ts`
- Create: `packages/backend/src/modules/health/health.service.spec.ts`
- Create: `packages/backend/src/modules/health/health.controller.ts`
- Create: `packages/backend/src/modules/health/health.controller.spec.ts`
- Create: `packages/backend/src/modules/health/health.module.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- Produces: `GET /api/health/live` and `GET /api/health/ready`.

- [ ] **Step 1: Write service and controller tests**

Test that `live()` returns:

```ts
{ status: 'ok', uptimeSeconds: expect.any(Number), version: expect.any(String) }
```

Test that `ready()` calls `prisma.$queryRaw` with `SELECT 1`, returns `{ status: 'ready' }`, and throws `ServiceUnavailableException` with `{ status: 'not_ready' }` on rejection. Controller tests must verify both methods are marked public and the ready route has an explicit throttle.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/health
```

Expected: FAIL because the health module does not exist.

- [ ] **Step 3: Implement and register the module**

Use `process.uptime()` and `process.env.npm_package_version ?? '0.0.0'` for liveness. Use:

```ts
await this.prisma.$queryRaw`SELECT 1`;
```

for readiness. Apply `@Public()` to both routes and `@Throttle({ default: { ttl: 60_000, limit: 60 } })` at controller level. Import `HealthModule` in `AppModule`.

- [ ] **Step 4: Verify and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/health
corepack pnpm@10.33.2 --filter @nongchang/backend build
git add packages/backend/src/modules/health packages/backend/src/app.module.ts
git commit -m "feat: add liveness and readiness endpoints"
```

### Task 4: Add structured request completion logs

**Files:**
- Create: `packages/backend/src/common/logging/request-id.ts`
- Create: `packages/backend/src/common/logging/request-id.spec.ts`
- Create: `packages/backend/src/common/logging/request-logging.interceptor.ts`
- Create: `packages/backend/src/common/logging/request-logging.interceptor.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

**Interfaces:**
- Produces: one JSON log per completed request with `requestId`, `method`, `path`, `status`, `durationMs`, and optional `tenantId`/`userId`.

- [ ] **Step 1: Write request-ID and redaction tests**

Test that IDs matching `^[A-Za-z0-9._:-]{1,64}$` are accepted and other values produce a UUID. Interceptor tests must inspect the serialized log and prove it does not contain test authorization, cookie, body, query-secret, or AI-message values.

Use a request fixture containing deliberately recognizable secrets:

```ts
headers: { authorization: 'Bearer DO_NOT_LOG', cookie: 'nc_refresh=DO_NOT_LOG' },
body: { apiKey: 'DO_NOT_LOG', message: 'DO_NOT_LOG' },
query: { secret: 'DO_NOT_LOG' },
```

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/logging
```

Expected: FAIL because logging modules do not exist.

- [ ] **Step 3: Implement completion logging**

Use `performance.now()` for duration and RxJS `tap`/`catchError` or `finalize` to log both success and error status exactly once. Normalize the path by using `request.route?.path ?? request.url.split('?')[0]`. Write the request ID to `X-Request-Id` on the response.

Register with:

```ts
{ provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }
```

The log payload must be created from an allowlist; never spread request or response objects.

- [ ] **Step 4: Verify and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/logging
corepack pnpm@10.33.2 --filter @nongchang/backend build
git add packages/backend/src/common/logging packages/backend/src/app.module.ts
git commit -m "feat: emit structured request completion logs"
```

### Task 5: Split `BatchAdmin` into focused surfaces

**Files:**
- Create: `packages/web/src/components/batch-admin/useBatchAdminFilters.ts`
- Create: `packages/web/src/components/batch-admin/BatchCommandBar.tsx`
- Create: `packages/web/src/components/batch-admin/BatchTable.tsx`
- Create: `packages/web/src/components/batch-admin/BatchLifecycleDialog.tsx`
- Create: `packages/web/src/components/batch-admin/BatchCodesDialog.tsx`
- Create: `packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx`
- Create: `packages/web/src/components/batch-admin/BatchDeleteDialog.tsx`
- Create: `packages/web/src/components/batch-admin/CreateBatchModal.tsx`
- Create: `packages/web/src/components/BatchAdmin.boundary.spec.ts`
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Modify: existing `BatchAdmin*.spec.tsx` files only for import paths and accessible queries.

**Interfaces:**
- Produces: `BatchAdmin.tsx` as a coordinator below 500 lines.
- Preserves: duplicate-submit locking, filters, pagination, lifecycle, trace generation, label export, credentials, cost actions, and deletion confirmation.

- [ ] **Step 1: Write the architectural boundary test**

Create `BatchAdmin.boundary.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./BatchAdmin.tsx', import.meta.url)), 'utf8');

describe('BatchAdmin module boundary', () => {
  it('keeps the page coordinator below 500 lines', () => {
    expect(source.split(/\r?\n/).length).toBeLessThan(501);
  });

  it.each([
    './batch-admin/BatchTable',
    './batch-admin/BatchLifecycleDialog',
    './batch-admin/BatchLabelWorkspace',
    './batch-admin/CreateBatchModal',
  ])('imports %s', (modulePath) => {
    expect(source).toContain(modulePath);
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.boundary.spec.ts
```

Expected: FAIL because the file is about 1555 lines and the extracted modules do not exist.

- [ ] **Step 3: Extract filter/pagination state and command bar**

`useBatchAdminFilters` owns search code, crop/house/date filters, advanced-filter visibility, page reset, filtered rows, and paged rows. Its interface is:

```ts
export function useBatchAdminFilters(batches: ViewBatch[]): {
  searchCode: string;
  setSearchCode(value: string): void;
  filterType: string;
  setFilterType(value: string): void;
  filterHouse: string;
  setFilterHouse(value: string): void;
  filterDateRange: string;
  setFilterDateRange(value: string): void;
  showAdvancedFilter: boolean;
  setShowAdvancedFilter(value: boolean): void;
  page: number;
  setPage(value: number): void;
  filteredData: ViewBatch[];
  pagedData: ViewBatch[];
}
```

Move the existing command-bar JSX without copy changes into `BatchCommandBar`.

- [ ] **Step 4: Extract table and dialogs with explicit props**

`BatchTable` receives rows, selected IDs, selection callbacks, and action callbacks. Each dialog receives only its data, busy flags, close callback, and relevant mutation callback. Move existing markup unchanged before simplifying any prop names.

`CreateBatchModal` uses the current interface:

```ts
{ fields: Field[]; onClose(): void; onCreated(): Promise<void> | void }
```

`BatchLabelWorkspace` owns label/PDF preview settings and generated-code presentation; generation itself remains a callback from the coordinator so API mutation state has one owner.

- [ ] **Step 5: Keep all behavioral tests green after each extraction**

After each component move run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.model.spec.ts src/components/BatchAdmin.fluent-depth.spec.tsx src/components/BatchAdmin.boundary.spec.ts
```

Expected: PASS only after the final extraction; intermediate failures must be fixed before the next move.

- [ ] **Step 6: Verify build and commit**

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
git add packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin*.spec.* packages/web/src/components/batch-admin
git commit -m "refactor: split the batch administration console"
```

### Task 6: Split `DashboardDemo` while preserving its lazy boundary

**Files:**
- Create: `packages/web/src/components/dashboard-demo/demo-data.ts`
- Create: `packages/web/src/components/dashboard-demo/useDashboardDemoLayout.ts`
- Create: `packages/web/src/components/dashboard-demo/DemoKpiGrid.tsx`
- Create: `packages/web/src/components/dashboard-demo/DemoMapPanel.tsx`
- Create: `packages/web/src/components/dashboard-demo/DemoChartsPanel.tsx`
- Create: `packages/web/src/components/dashboard-demo/DemoOperationsPanel.tsx`
- Create: `packages/web/src/components/DashboardDemo.boundary.spec.ts`
- Modify: `packages/web/src/components/DashboardDemo.tsx`
- Modify: `packages/web/src/components/DashboardDemo.truthfulness.spec.tsx`
- Modify: `packages/web/src/config/manual-chunks.spec.ts`

**Interfaces:**
- Produces: `DashboardDemo.tsx` below 400 lines.
- Preserves: explicit opt-in, demo badges/copy, presentation mode, export behavior, and `dashboard-demo-*` chunks.

- [ ] **Step 1: Write the architectural boundary test**

Read `DashboardDemo.tsx` as source and assert fewer than 400 lines plus imports for `DemoKpiGrid`, `DemoMapPanel`, `DemoChartsPanel`, and `DemoOperationsPanel`.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.boundary.spec.ts
```

Expected: FAIL because the current file is about 1538 lines.

- [ ] **Step 3: Extract static data, layout state, and panels**

Move all static demo arrays and color constants to `demo-data.ts`. `useDashboardDemoLayout` owns grid layout, presentation mode, and reset behavior. Each panel receives serializable display data and callbacks; panels must not call production APIs.

Use this panel boundary:

```ts
export interface DemoPanelProps {
  presentationMode: boolean;
}
```

Extend individual panels only with their own display data/callbacks rather than passing the whole dashboard state object.

- [ ] **Step 4: Verify truthfulness and chunk isolation**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.boundary.spec.ts src/components/DashboardDemo.truthfulness.spec.tsx src/components/Dashboard.truthfulness.spec.tsx src/config/manual-chunks.spec.ts
corepack pnpm@10.33.2 --filter web build
```

Expected: tests PASS; build output still contains separate `DashboardDemo` and `dashboard-demo-*` chunks.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/DashboardDemo.tsx packages/web/src/components/DashboardDemo*.spec.* packages/web/src/components/dashboard-demo packages/web/src/config/manual-chunks.spec.ts
git commit -m "refactor: split the opt-in demo dashboard"
```

### Task 7: Consolidate runtime response contracts in shared

**Files:**
- Create: `packages/shared/src/dto/resource-views.dto.ts`
- Create: `packages/shared/src/dto/resource-views.dto.spec.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `package.json`
- Modify: `packages/web/src/api/batches.ts`
- Modify: `packages/web/src/api/fields.ts`
- Modify: `packages/web/src/api/farm-records.ts`
- Modify: `packages/web/src/api/trace.ts`
- Modify: `packages/miniapp/src/api/farm.ts`
- Modify: `packages/miniapp/src/api/trace.ts`
- Modify: affected API tests in web and miniapp.

**Interfaces:**
- Produces: `batchViewSchema`, `fieldViewSchema`, `farmRecordViewSchema`, `traceCodeViewSchema`, and `traceEventViewSchema` plus inferred types.

- [ ] **Step 1: Write shared schema tests**

Create representative valid fixtures and one invalid fixture per schema. At minimum, prove that dates are strings, numeric amounts are numbers, nullable optional fields are accepted, and missing IDs are rejected.

Use runtime parsing:

```ts
expect(batchViewSchema.parse(validBatch)).toEqual(validBatch);
expect(() => batchViewSchema.parse({ ...validBatch, id: undefined })).toThrow();
```

- [ ] **Step 2: Verify RED**

Add `vitest` to shared dev dependencies and a `test` script, then run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test
```

Expected: FAIL because `resource-views.dto.ts` does not exist.

- [ ] **Step 3: Implement and export the schemas**

Define strict Zod schemas matching current serialized backend responses. Reuse existing enums and `z.record(z.unknown())` for JSON payloads. Export both schema values and inferred types from `packages/shared/src/index.ts`.

- [ ] **Step 4: Parse client API responses**

Replace local interfaces with shared types. Parse response bodies at the API boundary, for example:

```ts
const result = await request<unknown>('/batches');
return z.array(batchViewSchema).parse(result);
```

For paginated farm records, parse the envelope and each item. Keep DTO request types unchanged.

- [ ] **Step 5: Add shared tests to the root unit gate**

Change root `test:unit` so shared build and shared tests run before backend, web, and miniapp suites.

- [ ] **Step 6: Verify contracts and all consumers**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test
corepack pnpm@10.33.2 build:shared
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter @nongchang/miniapp test
corepack pnpm@10.33.2 --filter web lint
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
```

Expected: PASS with valid Stage A miniapp environment variables set for the build.

- [ ] **Step 7: Commit**

```powershell
git add packages/shared package.json pnpm-lock.yaml packages/web/src/api packages/miniapp/src/api
git commit -m "refactor: validate shared resource response contracts"
```

### Task 8: Document operations and run the final completion gate

**Files:**
- Modify: `docs/deploy/baota.md`
- Modify: `docs/ops/production-verification.md`

**Interfaces:**
- Produces: deployable health checks and structured-log expectations.

- [ ] **Step 1: Document health and logging**

Add Nginx/PM2 checks for `/api/health/live` and `/api/health/ready`. Document the JSON log fields, request-ID response header, sensitive-data exclusions, and how a `503` readiness response should remove an instance from traffic without restarting solely on a transient database outage.

- [ ] **Step 2: Run the complete production gate**

```powershell
docker compose -f docker-compose.dev.yml up -d
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
psql "$env:DATABASE_URL" -f packages/backend/prisma/audit-data-consistency.sql
corepack pnpm@10.33.2 verify:production
corepack pnpm@10.33.2 audit --prod --audit-level high
git status --short
```

Expected: audit SQL returns zero rows; both commands exit `0`; Git status shows only the two intended documentation files before commit.

- [ ] **Step 3: Commit**

```powershell
git add docs/deploy/baota.md docs/ops/production-verification.md
git commit -m "docs: add production health and logging operations"
```
