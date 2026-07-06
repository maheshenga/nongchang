# WeChat Identity Consistency P5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align WeChat account identity with the product lookup model so the same OpenID may exist in different tenants while remaining unique inside one tenant.

**Architecture:** Keep anonymous miniapp login resolving tenant by globally unique WeChat `appId`, then resolve users by `(tenantId, wxOpenid)`. Move the database guarantee from global `wx_openid` uniqueness to tenant-scoped uniqueness, and make service queries use the generated compound unique selector.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Vitest, pnpm 10.33.2.

---

## File Structure

- Modify: `packages/backend/prisma/schema.prisma`
  - Remove `@unique` from `User.wxOpenid`.
  - Add `@@unique([tenantId, wxOpenid])`.
- Create: `packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql`
  - Drop `users_wx_openid_key`.
  - Add tenant-scoped unique index on `users(tenant_id, wx_openid)`.
  - Include a same-tenant duplicate guard before index creation.
- Modify: `packages/backend/src/auth/auth.service.ts`
  - Change WeChat login and duplicate-registration lookup from `findFirst` to `findUnique({ where: { tenantId_wxOpenid: ... } })`.
- Modify: `packages/backend/src/auth/auth.service.spec.ts`
  - Update mock Prisma helper to support the compound selector.
  - Add tests for cross-tenant same-OpenID behavior.
- Modify: `packages/backend/test/integration-wechat.e2e-spec.ts`
  - Tighten created-user and duplicate-count queries to include tenant scope.

---

### Task 1: Tenant-Scoped WeChat Schema

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql`

- [ ] **Step 1: Write the migration first**

Create `packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql`:

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "wx_openid" IS NOT NULL
    GROUP BY "tenant_id", "wx_openid"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create tenant-scoped wx_openid uniqueness: duplicate (tenant_id, wx_openid) rows exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "users_wx_openid_key";

CREATE UNIQUE INDEX "users_tenant_id_wx_openid_key"
  ON "users"("tenant_id", "wx_openid");
```

- [ ] **Step 2: Update Prisma schema**

Change the `User` model:

```prisma
  wxOpenid     String?  @map("wx_openid")
```

Add the compound unique below `@@unique([tenantId, username])`:

```prisma
  @@unique([tenantId, username])
  @@unique([tenantId, wxOpenid])
  @@index([tenantId])
```

- [ ] **Step 3: Validate schema formatting**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma format --schema prisma/schema.prisma
```

Expected: exit code `0`; schema keeps `@@unique([tenantId, wxOpenid])`.

---

### Task 2: Auth Service Compound Lookup

**Files:**
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Add failing tests for tenant-scoped OpenID**

In `packages/backend/src/auth/auth.service.spec.ts`, replace `makeWechatService` with an array-backed helper:

```typescript
function makeWechatService(opts: { lookup?: any; existingUser?: any; users?: any[] }) {
  const jwt = new JwtService({ secret: 'test' });
  const created: any[] = [];
  const users = opts.users ?? (opts.existingUser ? [opts.existingUser] : []);
  const findByTenantOpenid = (tenantId: string, wxOpenid: string) => (
    users.find(u => u.tenantId === tenantId && u.wxOpenid === wxOpenid) ?? null
  );
  const prisma = {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.tenantId_wxOpenid) {
          return findByTenantOpenid(where.tenantId_wxOpenid.tenantId, where.tenantId_wxOpenid.wxOpenid);
        }
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => findByTenantOpenid(where.tenantId, where.wxOpenid)),
      create: vi.fn().mockImplementation(async ({ data }: any) => { const u = { id: 'newu', ...data }; created.push(u); return u; }),
    },
  } as any;
  const integrations = stubIntegrations(opts.lookup ?? null);
  const groups = stubGroups('gDefault');
  const svc = new AuthService(prisma, jwt, integrations, groups);
  return { svc, prisma, integrations, groups, created };
}
```

Add to `describe('AuthService.loginWechat')`:

```typescript
  it('same wxOpenid in another tenant does not affect current tenant login', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'SHARED_OPENID' }));
    const { svc } = makeWechatService({
      lookup: { tenantId: 't2', secret: 's2' },
      users: [
        { id: 'u1', tenantId: 't1', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'SHARED_OPENID', tenant: activeTenant },
        { id: 'u2', tenantId: 't2', role: 'merchant', agentId: null, status: 'active', wxOpenid: 'SHARED_OPENID', tenant: activeTenant },
      ],
    });

    const res = await svc.loginWechat({ code: 'c', appId: 'wxTenant2' });
    const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.userId).toBe('u2');
    expect(payload.tenantId).toBe('t2');
  });
```

Add to `describe('AuthService.registerWechat')`:

```typescript
  it('same wxOpenid in another tenant does not block current tenant registration', async () => {
    vi.stubGlobal('fetch', wxFetch({ openid: 'CROSS_TENANT_OPENID' }));
    const { svc, created } = makeWechatService({
      lookup: { tenantId: 't2', secret: 's2' },
      users: [
        { id: 'u1', tenantId: 't1', wxOpenid: 'CROSS_TENANT_OPENID', status: 'active' },
      ],
    });

    await expect(svc.registerWechat({ appId: 'wxTenant2', code: 'c', displayName: '赵六' }))
      .resolves.toEqual({ status: 'pending' });
    expect(created).toHaveLength(1);
    expect(created[0].tenantId).toBe('t2');
    expect(created[0].wxOpenid).toBe('CROSS_TENANT_OPENID');
  });
```

- [ ] **Step 2: Run tests and verify they fail before implementation**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test -- src/auth/auth.service.spec.ts
```

Expected: at least one new test fails while `AuthService` still uses the old lookup shape or the mock proves the compound selector is not used.

- [ ] **Step 3: Update AuthService to use the compound selector**

In `packages/backend/src/auth/auth.service.ts`, change both WeChat user lookups to:

```typescript
    const user = await this.prisma.user.findUnique({
      where: { tenantId_wxOpenid: { tenantId: lookup.tenantId, wxOpenid: openid } },
      include: { tenant: { select: { status: true } } },
    });
```

and:

```typescript
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_wxOpenid: { tenantId: lookup.tenantId, wxOpenid: openid } },
    });
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test -- src/auth/auth.service.spec.ts
```

Expected: `AuthService` tests pass.

---

### Task 3: E2E Fixture Scope Tightening

**Files:**
- Modify: `packages/backend/test/integration-wechat.e2e-spec.ts`

- [ ] **Step 1: Scope test fixture queries by tenant**

After registration, query the configured tenant through the appId-backed integration row:

```typescript
    const integration = await prisma.integrationConfig.findFirst({
      where: { appId: TEST_APPID, provider: 'wechat' },
      select: { tenantId: true },
    });
    expect(integration).toBeTruthy();
    const created = await prisma.user.findFirst({
      where: { tenantId: integration!.tenantId, wxOpenid: TEST_OPENID },
    });
```

For the duplicate count assertion:

```typescript
    const integration = await prisma.integrationConfig.findFirst({
      where: { appId: TEST_APPID, provider: 'wechat' },
      select: { tenantId: true },
    });
    expect(integration).toBeTruthy();
    const count = await prisma.user.count({
      where: { tenantId: integration!.tenantId, wxOpenid: TEST_OPENID },
    });
```

- [ ] **Step 2: Run focused compile/test checks**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
corepack pnpm@10.33.2 --filter @nongchang/backend test -- src/auth/auth.service.spec.ts
```

Expected: both commands exit `0`.

---

### Task 4: Final Verification and Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run verification gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test -- src/auth/auth.service.spec.ts src/modules/integration/integration-config.service.spec.ts
corepack pnpm@10.33.2 test:unit
git diff --check
```

Expected: all exit `0`. If `test:e2e` is still blocked by local PostgreSQL/PostGIS at `127.0.0.1:5544`, record that blocker explicitly and do not claim e2e passed.

- [ ] **Step 2: Request code review**

Ask one reviewer to check:

```text
Review P5 WeChat identity consistency changes. Requirements: User.wxOpenid must no longer be globally unique; DB uniqueness must be (tenant_id, wx_openid); AuthService must resolve WeChat users and duplicates with tenant-scoped lookup; existing appId-to-tenant resolution remains unchanged; tests should cover same OpenID across different tenants. Look for migration safety, Prisma generated-selector risks, and test realism.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql packages/backend/src/auth/auth.service.ts packages/backend/src/auth/auth.service.spec.ts packages/backend/test/integration-wechat.e2e-spec.ts docs/superpowers/plans/2026-07-06-wechat-identity-consistency-p5.md
git commit -m "fix(auth): scope wechat openid uniqueness by tenant"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage: Phase 5 acceptance criteria are mapped to schema/migration, AuthService compound lookup, and auth/e2e tests.
- Placeholder scan: no TBD/TODO/fill-later steps.
- Type consistency: the planned Prisma compound selector is `tenantId_wxOpenid`, matching Prisma's naming convention for `@@unique([tenantId, wxOpenid])`.
