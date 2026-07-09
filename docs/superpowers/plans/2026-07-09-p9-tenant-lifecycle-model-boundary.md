# P9 Tenant Lifecycle Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic tenant lifecycle helpers from `TenantService` so tenant list projection, code normalization, initial admin/default group data, and self-suspension guard are directly tested.

**Architecture:** `TenantService` remains responsible for Prisma access, transactions, random initial password generation, bcrypt hashing, duplicate checks, and NotFound/Conflict query flow. A new `tenant.model.ts` owns pure data transformations and the fail-closed current-tenant suspension guard.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` tenant/user DTO types.

## Global Constraints

- Do not change tenant controller routes, DTO schemas, Prisma query shapes, random password generation, bcrypt hashing, default permissions contents, or response shapes.
- Preserve tenant code normalization: `trim().toUpperCase()`.
- Preserve created tenant status: `active`.
- Preserve initial tenant admin role/status/phone behavior: role `SYSTEM_ADMIN`, status `active`, phone defaults to `null`.
- Preserve default group behavior: name `默认用户组`, `isDefault: true`, permissions copied from `DEFAULT_USER_GROUP_PERMISSIONS`.
- Preserve current-tenant suspension guard: actor cannot suspend `actor.tenantId`; activating current tenant remains allowed.

---

## File Structure

- Create `packages/backend/src/modules/tenant/tenant.model.ts`
  - Pure helpers for tenant code normalization, list view projection, create data, default group data, and status guard.
- Create `packages/backend/src/modules/tenant/tenant.model.spec.ts`
  - Direct helper tests.
- Modify `packages/backend/src/modules/tenant/tenant.service.ts`
  - Replace private projection and inline data construction with helpers.

---

### Task 1: Add Tenant Model Tests

**Files:**
- Create: `packages/backend/src/modules/tenant/tenant.model.spec.ts`

**Interfaces:**
- Future exports:
  - `normalizeTenantCode(code: string): string`
  - `toTenantListItem(row: TenantRow): TenantListItem`
  - `buildTenantCreateData(dto: CreateTenantDto, code: string): { name: string; code: string; status: 'active' }`
  - `buildTenantAdminCreateData(tenantId: string, passwordHash: string, dto: CreateTenantDto)`
  - `buildDefaultTenantGroupCreateData(tenantId: string, permissions: readonly string[])`
  - `assertCanSetTenantStatus(actor: AuthUser, tenantId: string, status: TenantStatus): void`
  - `toTenantStatusResult(row: { id: string; status: string }): { id: string; status: TenantStatus }`

- [x] **Step 1: Write failing tests**

Run after creating the test file: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.model.spec.ts`

Expected: FAIL because `./tenant.model` does not exist.

---

### Task 2: Implement Tenant Model Helpers

**Files:**
- Create: `packages/backend/src/modules/tenant/tenant.model.ts`

- [x] **Step 1: Implement helpers**

Use exact current semantics from `TenantService`: code trimming/uppercasing, count defaults to zero, date ISO conversion, current-tenant suspend guard, and default group permissions cloned with `[...permissions]`.

- [x] **Step 2: Run model tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.model.spec.ts`

Expected: PASS.

---

### Task 3: Wire TenantService

**Files:**
- Modify: `packages/backend/src/modules/tenant/tenant.service.ts`

- [x] **Step 1: Replace inline model logic**

Use helpers in `list`, `create`, and `setStatus`. Keep duplicate lookup, random password, bcrypt hash, transaction, and NotFound query logic inside the service.

- [x] **Step 2: Run focused tenant tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.model.spec.ts src/modules/tenant/tenant.service.spec.ts src/modules/tenant/tenant.controller.spec.ts`

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Request review with this scope:

```text
Review P9 tenant lifecycle model boundary. Ensure no route/DTO/Prisma query/random password/bcrypt/default permissions/response behavior changed. Verify code normalization, initial admin data, default group data, tenant list projection, and current-tenant suspension guard match previous behavior.
```

Commit:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p9-tenant-lifecycle-model-boundary.md packages/backend/src/modules/tenant/tenant.model.ts packages/backend/src/modules/tenant/tenant.model.spec.ts packages/backend/src/modules/tenant/tenant.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract tenant lifecycle model helpers"
```

---

## Self-Review

- Spec coverage: code normalization, list projection, initial admin/default group creation data, status guard, service wiring, verification, review, and commit are covered.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper signatures are consistent across plan tasks.
