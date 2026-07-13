# Full Hardening Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct proxy-aware throttling, close user-group authorization races, add durable upload authorization/accounting/quotas, and make backend shutdown readiness-safe.

**Architecture:** Runtime networking configuration is centralized in a tested helper and applied before listening. User-group default transitions use transactions plus a PostgreSQL partial unique index. Uploads reserve durable quota and a pending asset row before OSS I/O, finalize after success, and compensate on failure. Health readiness becomes false during application shutdown.

**Tech Stack:** NestJS 10, Express, `@nestjs/throttler` 6, Prisma 5, PostgreSQL 16/PostGIS, Vitest, Supertest, Ali OSS.

## Global Constraints

- Preserve `/api/auth/login`, `/api/auth/refresh`, and miniapp bearer-token compatibility.
- Preserve fail-closed tenant and owner authorization.
- Do not log uploaded content, authorization headers, OSS credentials, or signed URLs.
- Use `corepack pnpm@10.33.2` for all verification commands.
- Every production-code behavior change must be preceded by a failing test.
- The final release gate is `corepack pnpm@10.33.2 verify:production` against the prepared PostGIS database.

---

## File Structure

- Create `packages/backend/src/common/network/trusted-proxy.ts`: parse trusted hops and configure Express.
- Create `packages/backend/src/common/network/trusted-proxy.spec.ts`: unit coverage for valid and invalid hop counts.
- Modify `packages/backend/src/main.ts`: apply trusted proxy and enable shutdown hooks.
- Modify `packages/backend/test/throttler.e2e-spec.ts`: prove separate forwarded clients receive separate buckets.
- Modify `packages/backend/src/modules/user-group/user-group.controller.ts`: method-level CRUD roles.
- Create `packages/backend/src/modules/user-group/user-group.controller.spec.ts`: metadata boundary tests.
- Modify `packages/backend/src/modules/user-group/user-group.service.ts`: transactional default switching and race-safe `ensureDefault`.
- Modify `packages/backend/src/modules/user-group/user-group.service.spec.ts`: transaction and conflict tests.
- Modify `packages/backend/prisma/schema.prisma`: upload asset/usage models and tenant/user relations.
- Create `packages/backend/prisma/migrations/20260713120000_release1_security_upload/migration.sql`: default-group partial uniqueness and upload tables.
- Create `packages/backend/src/modules/upload/upload-policy.ts`: dynamic purpose authorization.
- Create `packages/backend/src/modules/upload/upload-policy.spec.ts`: purpose/role/permission tests.
- Create `packages/backend/src/modules/upload/upload-quota.service.ts`: locked quota reservation/finalization/release.
- Create `packages/backend/src/modules/upload/upload-quota.service.spec.ts`: daily/active/concurrency boundary tests.
- Modify `packages/backend/src/modules/upload/upload.model.ts`: `ai-diagnose`, tenant-prefixed keys, checksum helpers.
- Modify `packages/backend/src/modules/upload/oss.service.ts`: add safe object deletion.
- Modify `packages/backend/src/modules/upload/upload.service.ts`: policy, quota, pending/final asset flow.
- Modify `packages/backend/src/modules/upload/upload.controller.ts`: pass the full authenticated actor.
- Modify `packages/backend/src/modules/upload/upload.module.ts`: register quota/policy dependencies.
- Modify web and miniapp upload API callers to send explicit purposes.
- Create `packages/backend/scripts/cleanup-stale-uploads.ts`: operator cleanup fallback.
- Modify `packages/backend/package.json`: expose `uploads:cleanup`.
- Modify `packages/backend/src/modules/health/health.service.ts`: shutdown-aware readiness.
- Modify `packages/backend/src/modules/health/health.service.spec.ts`: shutdown readiness test.
- Modify environment examples and production operations documentation.

### Task 1: Configure trusted proxy identity and graceful shutdown

**Interfaces:**

- Produces `parseTrustProxyHops(env: NodeJS.ProcessEnv): number`.
- Produces `configureTrustedProxy(app: INestApplication, hops: number): void`.
- `main.ts` consumes both before `listen()` and calls `enableShutdownHooks(['SIGTERM', 'SIGINT'])`.

- [ ] **Step 1: Write failing proxy parser tests**

```ts
describe('parseTrustProxyHops', () => {
  it('accepts an integer from zero through five', () => {
    expect(parseTrustProxyHops({ TRUST_PROXY_HOPS: '0' })).toBe(0);
    expect(parseTrustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
  });

  it.each(['-1', '1.5', '6', 'abc'])('rejects unsafe value %s', (value) => {
    expect(() => parseTrustProxyHops({ TRUST_PROXY_HOPS: value })).toThrow('TRUST_PROXY_HOPS');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/network/trusted-proxy.spec.ts
```

Expected: FAIL because `trusted-proxy.ts` does not exist.

- [ ] **Step 3: Implement trusted proxy configuration**

```ts
import type { INestApplication } from '@nestjs/common';

export function parseTrustProxyHops(env: NodeJS.ProcessEnv): number {
  const raw = env.TRUST_PROXY_HOPS ?? '1';
  if (!/^\d+$/.test(raw)) throw new Error('[启动校验] TRUST_PROXY_HOPS 必须是 0 到 5 的整数');
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) {
    throw new Error('[启动校验] TRUST_PROXY_HOPS 必须是 0 到 5 的整数');
  }
  return hops;
}

export function configureTrustedProxy(app: INestApplication, hops: number): void {
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}
```

In `main.ts`, call `validateEnv()`, parse the hops, create the app, configure the adapter, enable shutdown hooks, then apply Helmet and listen.

- [ ] **Step 4: Add forwarded-client throttler E2E**

Configure the test app with `trust proxy = 1`. Send three requests with `X-Forwarded-For: 203.0.113.10`, three with `203.0.113.11`, then verify the fourth request from only the first address is `429`. This test must fail before the test app is configured to trust one proxy hop.

- [ ] **Step 5: Make readiness shutdown-aware**

Implement `BeforeApplicationShutdown` on `HealthService`:

```ts
private shuttingDown = false;

beforeApplicationShutdown(): void {
  this.shuttingDown = true;
}

async ready() {
  if (this.shuttingDown) throw new ServiceUnavailableException({ status: 'not_ready' });
  // existing SELECT 1 behavior
}
```

Write the failing test before the implementation and verify `ready()` returns `503` after `beforeApplicationShutdown()`.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/network src/modules/health test/throttler.e2e-spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: all focused tests and the backend build pass.

Commit: `fix(backend): trust proxy client identity and drain readiness`

### Task 2: Close user-group CRUD and default-group races

**Interfaces:**

- `GET /user-groups` and `PUT /user-groups/assign` remain available to `SYSTEM_ADMIN` and `AGENT_ADMIN`.
- `POST`, `PATCH`, and `DELETE /user-groups` require `SYSTEM_ADMIN`.
- `switchDefaultInTransaction(tx, tenantId, mutation)` performs clear-and-write atomically.

- [ ] **Step 1: Write controller metadata tests**

Use Nest `Reflector` with `ROLES_KEY` to assert create/update/remove resolve to `[Role.SYSTEM_ADMIN]`, while list/assign resolve to `[Role.SYSTEM_ADMIN, Role.AGENT_ADMIN]`.

- [ ] **Step 2: Verify controller RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.controller.spec.ts
```

Expected: FAIL because CRUD inherits agent-admin access from the class decorator.

- [ ] **Step 3: Add method-level roles**

Keep the class-level roles for list/assign and add `@Roles(Role.SYSTEM_ADMIN)` immediately above create, update, and remove.

- [ ] **Step 4: Write transactional service tests**

Extend the Prisma fake with `$transaction`. Assert that creating or updating `isDefault: true` performs `updateMany` and `create/update` through the same transaction client. Add a test where `ensureDefault` creation throws `{ code: 'P2002' }` and the subsequent reread returns the concurrently created group.

- [ ] **Step 5: Implement transactional switching and conflict reread**

```ts
private async createGroup(user: AuthUser, dto: UserGroupInput) {
  if (!dto.isDefault) return this.prisma.userGroup.create({ data: buildUserGroupCreateData({ tenantId: user.tenantId, dto }) });
  return this.prisma.$transaction(async (tx) => {
    await tx.userGroup.updateMany({ where: { tenantId: user.tenantId }, data: { isDefault: false } });
    return tx.userGroup.create({ data: buildUserGroupCreateData({ tenantId: user.tenantId, dto }) });
  });
}
```

Apply the same transaction boundary to update. In `ensureDefault`, catch only Prisma `P2002`, reread `{ tenantId, isDefault: true }`, and rethrow if no winner exists.

- [ ] **Step 6: Add the partial unique index migration**

Migration preflight:

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT tenant_id FROM user_groups WHERE is_default = true GROUP BY tenant_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'user_groups_multiple_defaults';
  END IF;
END $$;

CREATE UNIQUE INDEX user_groups_one_default_per_tenant
ON user_groups (tenant_id)
WHERE is_default = true;
```

- [ ] **Step 7: Add database-backed authorization/default tests**

Add E2E cases proving agent admin receives `403` for create/update/delete, can list and assign an existing group only to its own merchant, and direct SQL cannot create two defaults in one tenant.

- [ ] **Step 8: Verify and commit**

Run unit tests, deploy the migration to local PostGIS, then run the relevant E2E files.

Commit: `fix(authz): restrict user group administration`

### Task 3: Add upload purposes and authorization policy

**Interfaces:**

- `UploadPurpose = 'farm-record' | 'credential' | 'ai-diagnose'`.
- `assertUploadAllowed(prisma, actor, purpose): Promise<void>`.
- Web `uploadImage(file, purpose)` and miniapp `uploadFile(filePath, purpose)` require an explicit purpose.

- [ ] **Step 1: Write policy tests**

Cover system/agent credential access, merchant/member denial for credential, group-backed `record:create` for farm records, denial without the permission, and authenticated access to AI diagnosis.

- [ ] **Step 2: Verify policy RED**

Expected: FAIL because `upload-policy.ts` and `ai-diagnose` do not exist.

- [ ] **Step 3: Implement the policy**

```ts
export async function assertUploadAllowed(prisma: PrismaService, actor: AuthUser, purpose: UploadPurpose): Promise<void> {
  if (purpose === 'ai-diagnose') return;
  if (purpose === 'credential') {
    if ([Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN].includes(actor.role)) return;
    throw new ForbiddenException('无权上传资质文件');
  }
  if ([Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN].includes(actor.role)) return;
  const row = await prisma.user.findFirst({
    where: { id: actor.userId, tenantId: actor.tenantId },
    select: { group: { select: { permissions: true } } },
  });
  const permissions = row?.group?.permissions;
  if (!Array.isArray(permissions) || !permissions.includes('record:create')) {
    throw new ForbiddenException('无权上传农事图片');
  }
}
```

- [ ] **Step 4: Make client purposes explicit**

Farm-record forms send `farm-record`; trace credential upload sends `credential`; AI assistant and miniapp AI panel send `ai-diagnose`. Add API wrapper tests asserting the query parameter.

- [ ] **Step 5: Verify and commit**

Run backend policy tests plus web/miniapp upload caller tests.

Commit: `fix(upload): enforce purpose authorization`

### Task 4: Add durable upload asset accounting and quotas

**Interfaces:**

- `UploadAssetStatus = PENDING | ACTIVE | FAILED | DELETED`.
- `UploadQuotaService.reserve(input): Promise<{ assetId: string }>`.
- `UploadQuotaService.activate(assetId, url): Promise<void>`.
- `UploadQuotaService.release(assetId, status): Promise<void>`.
- Environment defaults: daily `104857600` bytes and active `5368709120` bytes; both must be safe positive integers.

- [ ] **Step 1: Write model and quota tests**

Tests must prove tenant-prefixed object keys, SHA-256 checksum generation, daily-limit rejection, active-limit rejection, day rollover, and idempotent release.

- [ ] **Step 2: Verify RED**

Run the focused upload test directory. Expected: FAIL for missing models/services.

- [ ] **Step 3: Add Prisma models**

```prisma
enum UploadAssetStatus {
  PENDING
  ACTIVE
  FAILED
  DELETED
}

model UploadAsset {
  id         String            @id @default(uuid())
  tenantId   String            @map("tenant_id")
  userId     String            @map("user_id")
  purpose    String
  objectKey  String            @unique @map("object_key")
  url        String?
  sizeBytes  BigInt            @map("size_bytes")
  checksum   String
  status     UploadAssetStatus @default(PENDING)
  createdAt  DateTime          @default(now()) @map("created_at")
  updatedAt  DateTime          @updatedAt @map("updated_at")
  tenant     Tenant            @relation(fields: [tenantId], references: [id])
  user       User              @relation(fields: [userId], references: [id])

  @@index([tenantId, status, createdAt])
  @@index([userId, createdAt])
  @@map("upload_assets")
}

model UploadQuotaUsage {
  tenantId    String   @id @map("tenant_id")
  dayKey      String   @map("day_key")
  dailyBytes  BigInt   @default(0) @map("daily_bytes")
  activeBytes BigInt   @default(0) @map("active_bytes")
  updatedAt   DateTime @updatedAt @map("updated_at")
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@map("upload_quota_usage")
}
```

Add reverse relations on Tenant and User and create SQL tables, FKs, checks for non-negative counters, and indexes.

- [ ] **Step 4: Implement locked quota reservation**

Inside `prisma.$transaction`, upsert the usage row, lock it with `SELECT ... FOR UPDATE`, reset daily bytes when `dayKey` changes, compare `BigInt` counters to validated limits, update counters, and create a `PENDING` asset. Throw HTTP 429 with `{ code: 'UPLOAD_QUOTA_EXCEEDED', scope, limitBytes, usedBytes }` on exhaustion.

- [ ] **Step 5: Integrate OSS compensation**

Change the service flow to validate and authorize, compute checksum/key, reserve quota, upload to OSS, activate the asset, and return `{ url }`. On OSS failure release quota as `FAILED`. If activation fails after OSS succeeds, attempt `oss.delete(key, tenantId)` and release; preserve the original activation error.

- [ ] **Step 6: Add `OssService.delete`**

Use the same tenant-specific credential selection as `put`. Do not include key credentials in errors or logs. Add unit tests for tenant-config and environment clients.

- [ ] **Step 7: Add cleanup CLI**

The command selects bounded stale `PENDING` assets, attempts object deletion, and releases them as `DELETED`. Support `--older-than-minutes`, `--limit`, and `--execute`; default is dry-run.

- [ ] **Step 8: Add E2E coverage**

Prove successful upload creates an active asset, repeated uploads reach a test quota and return 429, an unauthorized member receives 403, and asset/usage rows remain tenant scoped.

- [ ] **Step 9: Verify and commit**

Run Prisma generation, upload unit tests, migration deployment, and upload E2E.

Commit: `feat(upload): add durable quota accounting`

### Task 5: Validate production configuration and document operations

- [ ] **Step 1: Extend environment validation tests**

Reject invalid `TRUST_PROXY_HOPS`, upload limits outside `1..Number.MAX_SAFE_INTEGER`, and active limits lower than the single-file limit. Keep non-production defaults usable.

- [ ] **Step 2: Update environment examples**

Document:

```env
TRUST_PROXY_HOPS=1
UPLOAD_DAILY_BYTES_LIMIT=104857600
UPLOAD_ACTIVE_BYTES_LIMIT=5368709120
UPLOAD_PENDING_MAX_AGE_MINUTES=60
```

- [ ] **Step 3: Update deployment and verification docs**

Add Nginx/XFF expectations, the quota error contract, asset cleanup dry-run/execute commands, shutdown/readiness behavior, and post-deploy probes.

- [ ] **Step 4: Run Release 1 verification**

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 verify:production
```

Expected: shared, backend, web, miniapp, builds, lint, dependency audit, migration precheck, and all E2E suites exit zero.

- [ ] **Step 5: Review the complete Release 1 diff and commit docs**

Commit: `docs: operate release 1 security controls`
