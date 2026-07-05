# User Group Read Permissions P2-C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the P2-B user-group permission guard from farm-record APIs to the existing read-only field, batch, and trace endpoints that already appear in the user-group permission UI.

**Architecture:** Keep `@Roles` as the coarse gate and `@Permissions(...)` as the fine gate for annotated routes. Admin roles continue to bypass group metadata through the existing guard; merchant/member-style operational users must have the declared permission. This P only wires read permissions (`field:view`, `batch:view`, `trace:view`) and preserves the default operating path by backfilling those read permissions into tenant default groups and assigning active merchants without a group to that default group.

**Tech Stack:** NestJS controllers/decorators, Prisma SQL migrations and seed data, shared TypeScript `Permission` constants, Vitest controller/component tests, React admin UI.

---

## Scope Boundary

This P intentionally does not add new write-action permissions such as `batch:update`, `field:create`, `trace:generate`, or `trace:event:create`. Those are higher-risk because they can change production behavior; they need separate permission keys and a separate migration plan.

This P also does not change the `PermissionsGuard` bypass rule from P2-B: `platform_admin`, `system_admin`, and `agent_admin` bypass user-group metadata, while operational users such as `merchant` must have the required group permissions.

## File Structure

- Create `packages/backend/src/modules/field/field.controller.spec.ts`
  - Verifies `GET /fields` has `Role.SYSTEM_ADMIN`, `Role.AGENT_ADMIN`, `Role.MERCHANT` and `Permission.FIELD_VIEW`.
- Modify `packages/backend/src/modules/field/field.controller.ts`
  - Imports `Permission` and `Permissions`; annotates the list route.
- Create `packages/backend/src/modules/batch/batch.controller.spec.ts`
  - Verifies `GET /batches`, `GET /batches/by-code/:code`, and `GET /batches/:id/lifecycle` require `Permission.BATCH_VIEW`.
- Modify `packages/backend/src/modules/batch/batch.controller.ts`
  - Imports `Permission` and `Permissions`; annotates read-only batch routes.
- Create `packages/backend/src/modules/trace/trace.controller.spec.ts`
  - Verifies `GET /trace/codes/:batchId` and `GET /trace/events/:batchId` require `Permission.TRACE_VIEW`.
- Modify `packages/backend/src/modules/trace/trace.controller.ts`
  - Imports `Permission` and `Permissions`; annotates trace read routes. Trace code generation and event creation remain role-only in this P.
- Create `packages/backend/prisma/migrations/20260706113000_user_group_read_permission_backfill/migration.sql`
  - Appends read permissions to default groups only, creates a migration-owned default group when a tenant has none, and assigns active merchants without a group. Non-default restricted groups remain unchanged.
- Modify `packages/backend/prisma/seed.ts`
  - Gives demo default groups all currently connected permissions.
- Modify `packages/backend/test/supply.e2e-spec.ts`
  - Keeps e2e fixtures aligned with all connected permissions.
- Modify `packages/web/src/components/UserGroups.tsx`
  - Updates truthful copy from "record only" to the connected read/write list.
- Modify `packages/web/src/components/UserGroups.spec.tsx`
  - Locks the new connected-permission wording.

---

### Task 1: Field Read Permission Metadata

**Files:**
- Create: `packages/backend/src/modules/field/field.controller.spec.ts`
- Modify: `packages/backend/src/modules/field/field.controller.ts`

- [ ] **Step 1: Write the failing controller metadata test**

Create `packages/backend/src/modules/field/field.controller.spec.ts`:

```typescript
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FieldController } from './field.controller';

describe('FieldController authorization metadata', () => {
  it('requires field:view permission for listing fields', () => {
    const handler = FieldController.prototype.list;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      Role.SYSTEM_ADMIN,
      Role.AGENT_ADMIN,
      Role.MERCHANT,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.FIELD_VIEW]);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/field/field.controller.spec.ts
```

Expected: FAIL because `GET /fields` has no `@Roles` or `@Permissions` metadata.

- [ ] **Step 3: Annotate `GET /fields`**

Modify imports in `packages/backend/src/modules/field/field.controller.ts`:

```typescript
import { AuthUser, CreateFieldDto, createFieldSchema, listQuerySchema, ListQuery, Permission, Role } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
```

Change the list route:

```typescript
@Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.FIELD_VIEW)
list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
  return this.svc.list(user, query);
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/field/field.controller.spec.ts src/modules/field/field.service.spec.ts src/common/guards/permissions.guard.spec.ts
```

Expected: PASS.

---

### Task 2: Batch Read Permission Metadata

**Files:**
- Create: `packages/backend/src/modules/batch/batch.controller.spec.ts`
- Modify: `packages/backend/src/modules/batch/batch.controller.ts`

- [ ] **Step 1: Write the failing batch metadata tests**

Create `packages/backend/src/modules/batch/batch.controller.spec.ts`:

```typescript
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { BatchController } from './batch.controller';

const roles = [Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT];

describe('BatchController authorization metadata', () => {
  it.each([
    ['list', BatchController.prototype.list],
    ['byCode', BatchController.prototype.byCode],
    ['lifecycle', BatchController.prototype.lifecycle],
  ] as const)('requires batch:view permission for %s', (_name, handler) => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(roles);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.BATCH_VIEW]);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/batch/batch.controller.spec.ts
```

Expected: FAIL because the read routes are not annotated with `batch:view`.

- [ ] **Step 3: Annotate read-only batch routes**

Modify imports in `packages/backend/src/modules/batch/batch.controller.ts`:

```typescript
import { AuthUser, CreateBatchDto, createBatchSchema, listQuerySchema, ListQuery, Permission, Role, UpdateBatchCostDto, updateBatchCostSchema, UpdateBatchStatusDto, updateBatchStatusSchema } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
```

Change the read routes:

```typescript
@Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.BATCH_VIEW)
list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
  return this.svc.list(user, query);
}

@Get('by-code/:code') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.BATCH_VIEW)
byCode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
  return this.svc.findByTraceCode(user, code);
}

@Get(':id/lifecycle') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.BATCH_VIEW)
lifecycle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
  return this.svc.lifecycle(user, id);
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/batch/batch.controller.spec.ts src/modules/batch/batch.service.spec.ts src/common/guards/permissions.guard.spec.ts
```

Expected: PASS.

---

### Task 3: Trace Read Permission Metadata

**Files:**
- Create: `packages/backend/src/modules/trace/trace.controller.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.controller.ts`

- [ ] **Step 1: Write the failing trace metadata tests**

Create `packages/backend/src/modules/trace/trace.controller.spec.ts`:

```typescript
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TraceController } from './trace.controller';

const roles = [Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT];

describe('TraceController authorization metadata', () => {
  it.each([
    ['listCodes', TraceController.prototype.listCodes],
    ['listEvents', TraceController.prototype.listEvents],
  ] as const)('requires trace:view permission for %s', (_name, handler) => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(roles);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.TRACE_VIEW]);
  });

  it('leaves trace generation as role-gated until a dedicated write permission exists', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TraceController.prototype.genCode)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TraceController.prototype.addEvent)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace.controller.spec.ts
```

Expected: FAIL because trace read routes do not have the new metadata.

- [ ] **Step 3: Annotate trace read routes only**

Modify imports in `packages/backend/src/modules/trace/trace.controller.ts`:

```typescript
import { AuthUser, CreateTraceEventDto, createTraceEventSchema, listQuerySchema, ListQuery, Permission, Role } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
```

Change read routes:

```typescript
@Get('codes/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.TRACE_VIEW)
listCodes(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
  return this.svc.listCodes(user, batchId, query);
}

@Get('events/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.TRACE_VIEW)
listEvents(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
  return this.svc.listEvents(user, batchId, query);
}
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/trace/trace.controller.spec.ts src/modules/trace/trace.service.spec.ts src/common/guards/permissions.guard.spec.ts
```

Expected: PASS.

---

### Task 4: Preserve Default Operating Path With Read-Permission Backfill

**Files:**
- Create: `packages/backend/prisma/migrations/20260706113000_user_group_read_permission_backfill/migration.sql`
- Modify: `packages/backend/prisma/seed.ts`
- Modify: `packages/backend/test/supply.e2e-spec.ts`

- [ ] **Step 1: Create the read-permission migration**

Create `packages/backend/prisma/migrations/20260706113000_user_group_read_permission_backfill/migration.sql`:

```sql
-- Backfill default user-group read permissions before field:view / batch:view /
-- trace:view start participating in authorization. Deliberately leave
-- non-default groups untouched so restricted groups do not gain read access.

INSERT INTO "user_groups" ("id", "tenant_id", "name", "is_default", "permissions", "created_at")
SELECT
  candidate."id",
  t."id",
  candidate."name",
  true,
  '["record:create","record:view"]'::jsonb,
  CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN LATERAL (
  SELECT
    'read-default-' || t."id" || '-' || n AS "id",
    '默认权限组-' || left(t."id", 8) || '-' || n AS "name"
  FROM generate_series(1, 1000) AS n
  WHERE NOT EXISTS (
    SELECT 1
    FROM "user_groups" existing_id
    WHERE existing_id."id" = 'read-default-' || t."id" || '-' || n
  )
    AND NOT EXISTS (
      SELECT 1
      FROM "user_groups" existing_name
      WHERE existing_name."tenant_id" = t."id"
        AND existing_name."name" = '默认权限组-' || left(t."id", 8) || '-' || n
    )
  ORDER BY n
  LIMIT 1
) candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM "user_groups" g
  WHERE g."tenant_id" = t."id"
    AND g."is_default" = true
);

UPDATE "user_groups" g
SET "permissions" = (
  SELECT jsonb_agg(p."permission" ORDER BY p."permission")
  FROM (
    SELECT DISTINCT value #>> '{}' AS "permission"
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(g."permissions") = 'array' THEN g."permissions"
        ELSE '[]'::jsonb
      END
    )
    WHERE jsonb_typeof(value) = 'string'
    UNION
    SELECT 'field:view'
    UNION
    SELECT 'batch:view'
    UNION
    SELECT 'trace:view'
  ) p
)
WHERE g."is_default" = true;

WITH default_groups AS (
  SELECT DISTINCT ON ("tenant_id") "tenant_id", "id"
  FROM "user_groups"
  WHERE "is_default" = true
  ORDER BY "tenant_id", "created_at" ASC, "id" ASC
)
UPDATE "users" u
SET "group_id" = dg."id"
FROM default_groups dg
WHERE u."tenant_id" = dg."tenant_id"
  AND u."group_id" IS NULL
  AND u."role" = 'merchant'::"Role"
  AND u."status" = 'active';
```

- [ ] **Step 2: Update seed default-group permissions**

In `packages/backend/prisma/seed.ts`, find the demo default user-group upsert/create block and make its `permissions` include all connected keys:

```typescript
permissions: [
  Permission.RECORD_CREATE,
  Permission.RECORD_VIEW,
  Permission.FIELD_VIEW,
  Permission.BATCH_VIEW,
  Permission.TRACE_VIEW,
],
```

Avoid importing `@nongchang/shared` in `prisma/seed.ts`; `pnpm --filter @nongchang/backend prisma:seed` does not build shared first. Use a local readonly string array for these five permission values.

- [ ] **Step 3: Update e2e fixture group permissions**

In `packages/backend/test/supply.e2e-spec.ts`, update the e2e permission group used for `merchantA` and `merchantB` to include:

```typescript
[
  Permission.RECORD_CREATE,
  Permission.RECORD_VIEW,
  Permission.FIELD_VIEW,
  Permission.BATCH_VIEW,
  Permission.TRACE_VIEW,
]
```

- [ ] **Step 4: Run migration-related static checks**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: PASS.

---

### Task 5: User-Groups UI Wording For Connected Permissions

**Files:**
- Modify: `packages/web/src/components/UserGroups.spec.tsx`
- Modify: `packages/web/src/components/UserGroups.tsx`

- [ ] **Step 1: Write failing wording expectation**

Update the first test in `packages/web/src/components/UserGroups.spec.tsx` so it expects the connected-permission text to include all enforced keys:

```typescript
expect(screen.getByText(/已接入接口会按用户组权限放行/)).toBeTruthy();
expect(screen.getByText(/创建农事记录、查看农事记录、查看地块、查看批次、查看溯源/)).toBeTruthy();
expect(screen.getByText(/管理员与未接入接口仍按角色与业务范围鉴权/)).toBeTruthy();
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx
```

Expected: FAIL until the visible wording lists the new connected read permissions.

- [ ] **Step 3: Update `UserGroups.tsx` copy only**

Change the explanatory paragraph to this meaning, preserving existing layout/classes:

```tsx
微信新注册用户默认进入「默认用户组」。经营角色在已接入接口会按用户组权限放行；当前已接入:创建农事记录、查看农事记录、查看地块、查看批次、查看溯源。管理员与未接入接口仍按角色与业务范围鉴权。
```

Keep `PERMISSION_OPTIONS` values backed by shared `Permission` constants.

- [ ] **Step 4: Run GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

---

### Task 6: Review, Verification, And Commit

**Files:**
- Review all files changed by Tasks 1-5.

- [ ] **Step 1: Run focused backend verification**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/field/field.controller.spec.ts src/modules/batch/batch.controller.spec.ts src/modules/trace/trace.controller.spec.ts src/common/guards/permissions.guard.spec.ts src/modules/field/field.service.spec.ts src/modules/batch/batch.service.spec.ts src/modules/trace/trace.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused web verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 3: Run build and full regression**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 test:unit
```

Expected: PASS for shared build, backend build, backend unit tests, web tests, and miniapp tests.

- [ ] **Step 4: Try e2e if local database is available**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e -- test/supply.e2e-spec.ts
```

Expected: PASS if local PostgreSQL/PostGIS at `127.0.0.1:5544` is running. If it is not running, record the exact precheck failure and do not claim e2e passed.

- [ ] **Step 5: Review checklist**

Check:

- `GET /fields` requires `field:view`.
- `GET /batches`, `GET /batches/by-code/:code`, and `GET /batches/:id/lifecycle` require `batch:view`.
- `GET /trace/codes/:batchId` and `GET /trace/events/:batchId` require `trace:view`.
- No write route gained a misleading view permission.
- Admin bypass behavior remains unchanged and intentional.
- Default groups are backfilled with read permissions and active groupless merchants are assigned to the default group; non-default restricted groups are not silently widened.
- UI copy names exactly the permissions now connected.
- No unrelated SaaS/user-system behavior changed.

- [ ] **Step 6: Diff hygiene and commit**

Run:

```bash
git diff --check
git status --short
git add docs/superpowers/plans/2026-07-06-user-group-read-permissions-p2c.md packages/backend/src/modules/field/field.controller.ts packages/backend/src/modules/field/field.controller.spec.ts packages/backend/src/modules/batch/batch.controller.ts packages/backend/src/modules/batch/batch.controller.spec.ts packages/backend/src/modules/trace/trace.controller.ts packages/backend/src/modules/trace/trace.controller.spec.ts packages/backend/prisma/migrations/20260706113000_user_group_read_permission_backfill/migration.sql packages/backend/prisma/seed.ts packages/backend/test/supply.e2e-spec.ts packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx
git commit -m "feat(authz): enforce user group read permissions"
```

Expected: commit succeeds on `codex/user-group-permissions-p2b` or the current continuation branch.

---

## Self-Review

- Spec coverage: This plan extends real permission enforcement to the remaining read permissions already exposed in user-group UI while keeping write actions out of scope.
- Placeholder scan: No TODO/TBD/fill-later placeholders are present.
- Type consistency: `Permission.FIELD_VIEW`, `Permission.BATCH_VIEW`, and `Permission.TRACE_VIEW` already exist in shared contracts from P2-B and are used consistently by backend tests, controllers, seed/e2e fixtures, and UI copy.
- Scope control: This P only annotates read-only endpoints and adds a conservative migration to preserve the default operating path without widening non-default restricted groups. It does not invent new permission keys or change business scope rules.
