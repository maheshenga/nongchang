# Auth Session Boundary P5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `AuthService` session and token-payload complexity by moving deterministic role recognition, `AuthUser` projection, and refresh-session eligibility into tested model helpers.

**Architecture:** Keep bcrypt password checks, Prisma reads/writes, JWT signing/verifying, WeChat exchange, exception throwing, and agent status checks inside `AuthService`. Add `auth.model.ts` beside the service for pure helpers that do not import Nest services or touch I/O. The service consumes these helpers while preserving all current endpoint behavior and error classes.

**Tech Stack:** NestJS 10, TypeScript, Vitest, existing backend auth service test pattern.

## Global Constraints

- Do not change auth route paths, DTOs, JWT secrets, JWT expiry values, bcrypt behavior, WeChat API behavior, password-change sessionVersion incrementing, or Prisma query shapes.
- Preserve password login behavior:
  - unknown tenant/user/password returns `UnauthorizedException`
  - unknown role returns `UnauthorizedException`
  - non-active user or tenant returns `ForbiddenException`
  - agent admin still requires an active linked agent
- Preserve refresh behavior:
  - invalid token, deleted user, non-active user, non-active tenant, or stale `sessionVersion` returns `UnauthorizedException`
  - agent admin still requires an active linked agent
  - refreshed token payload is rebuilt from the latest DB user row
- Preserve `AuthUser` payload semantics:
  - `userId` equals DB user `id`
  - `ownerId` equals user `id` only for `Role.MERCHANT`
  - `ownerId` is `null` for member, agent admin, system admin, and other non-merchant roles
  - `agentId` normalizes to `null`
  - `sessionVersion` defaults to `0`
- Follow TDD: add failing model tests before production helper implementation.

---

## File Structure

- Create: `packages/backend/src/auth/auth.model.ts`
  - Owns pure role recognition, `AuthUser` projection, and refresh-session eligibility.
- Create: `packages/backend/src/auth/auth.model.spec.ts`
  - Covers model helpers with RED/GREEN tests.
- Modify: `packages/backend/src/auth/auth.service.ts`
  - Replaces inline role list, refresh eligibility expression, and private `toAuthUser()` with model helpers.
- Add: `docs/superpowers/plans/2026-07-09-p5-auth-session-boundary.md`
  - Tracks this P5 execution.

## Task 1: Add RED Model Tests

**Files:**
- Create: `packages/backend/src/auth/auth.model.spec.ts`

**Interfaces:**
- Consumes: `isKnownRole(role: string): role is Role`
- Consumes: `toAuthUser(user: AuthAccountSnapshot): AuthUser`
- Consumes: `canRefreshSession(user: RefreshAccountSnapshot | null | undefined, tokenSessionVersion: number): boolean`
- Produces: regression coverage for token payload projection and refresh eligibility.

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/auth/auth.model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { canRefreshSession, isKnownRole, toAuthUser } from './auth.model';

describe('auth model helpers', () => {
  it('recognizes only shared roles as valid password-login roles', () => {
    expect(isKnownRole(Role.MERCHANT)).toBe(true);
    expect(isKnownRole(Role.MEMBER)).toBe(true);
    expect(isKnownRole(Role.AGENT_ADMIN)).toBe(true);
    expect(isKnownRole(Role.SYSTEM_ADMIN)).toBe(true);
    expect(isKnownRole(Role.PLATFORM_ADMIN)).toBe(true);
    expect(isKnownRole('owner')).toBe(false);
    expect(isKnownRole('')).toBe(false);
  });

  it('projects DB users into AuthUser token payloads with existing owner/session semantics', () => {
    expect(toAuthUser({
      id: 'merchant-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: 'agent-1',
      sessionVersion: 3,
    })).toEqual({
      userId: 'merchant-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: 'agent-1',
      ownerId: 'merchant-1',
      sessionVersion: 3,
    });

    expect(toAuthUser({
      id: 'member-1',
      tenantId: 'tenant-1',
      role: Role.MEMBER,
      agentId: null,
    })).toEqual({
      userId: 'member-1',
      tenantId: 'tenant-1',
      role: Role.MEMBER,
      agentId: null,
      ownerId: null,
      sessionVersion: 0,
    });

    expect(toAuthUser({
      id: 'agent-admin-1',
      tenantId: 'tenant-1',
      role: Role.AGENT_ADMIN,
      agentId: 'agent-1',
    }).ownerId).toBeNull();
  });

  it('accepts refresh only when account, tenant, and sessionVersion still match', () => {
    const activeUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      sessionVersion: 2,
      tenant: { status: 'active' },
    };

    expect(canRefreshSession(activeUser, 2)).toBe(true);
    expect(canRefreshSession({ ...activeUser, status: 'suspended' }, 2)).toBe(false);
    expect(canRefreshSession({ ...activeUser, tenant: { status: 'suspended' } }, 2)).toBe(false);
    expect(canRefreshSession({ ...activeUser, sessionVersion: 3 }, 2)).toBe(false);
    expect(canRefreshSession(null, 2)).toBe(false);
  });

  it('defaults missing DB sessionVersion to 0 for refresh compatibility', () => {
    expect(canRefreshSession({
      id: 'user-1',
      tenantId: 'tenant-1',
      role: Role.MERCHANT,
      agentId: null,
      status: 'active',
      tenant: { status: 'active' },
    }, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.model.spec.ts
```

Expected: FAIL because `auth.model.ts` does not exist yet.

## Task 2: Implement Auth Model Helpers

**Files:**
- Create: `packages/backend/src/auth/auth.model.ts`

**Interfaces:**
- Produces: `AuthAccountSnapshot`
- Produces: `RefreshAccountSnapshot`
- Produces: `isKnownRole()`
- Produces: `toAuthUser()`
- Produces: `canRefreshSession()`

- [ ] **Step 1: Add helper implementation**

Create `packages/backend/src/auth/auth.model.ts`:

```ts
import { AuthUser, Role } from '@nongchang/shared';

export interface AuthAccountSnapshot {
  id: string;
  tenantId: string;
  role: string;
  agentId: string | null;
  sessionVersion?: number | null;
}

export interface RefreshAccountSnapshot extends AuthAccountSnapshot {
  status: string;
  tenant: { status: string };
}

export function isKnownRole(role: string): role is Role {
  return (Object.values(Role) as string[]).includes(role);
}

export function toAuthUser(user: AuthAccountSnapshot): AuthUser {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as Role,
    agentId: user.agentId ?? null,
    ownerId: user.role === Role.MERCHANT ? user.id : null,
    sessionVersion: user.sessionVersion ?? 0,
  };
}

export function canRefreshSession(user: RefreshAccountSnapshot | null | undefined, tokenSessionVersion: number): boolean {
  if (!user) return false;
  return user.status === 'active'
    && user.tenant.status === 'active'
    && (user.sessionVersion ?? 0) === tokenSessionVersion;
}
```

- [ ] **Step 2: Verify GREEN for model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.model.spec.ts
```

Expected: PASS.

## Task 3: Replace Inline AuthService Logic

**Files:**
- Modify: `packages/backend/src/auth/auth.service.ts`

**Interfaces:**
- Consumes: `isKnownRole()`
- Consumes: `toAuthUser()`
- Consumes: `canRefreshSession()`

- [ ] **Step 1: Update imports**

Add:

```ts
import { canRefreshSession, isKnownRole, toAuthUser } from './auth.model';
```

- [ ] **Step 2: Replace password-login role check**

Replace:

```ts
const roles = Object.values(Role) as string[];
if (!roles.includes(user.role)) throw new UnauthorizedException('账号角色无效');
```

with:

```ts
if (!isKnownRole(user.role)) throw new UnauthorizedException('账号角色无效');
```

- [ ] **Step 3: Replace token payload projection calls**

Replace each:

```ts
this.toAuthUser(user)
```

with:

```ts
toAuthUser(user)
```

- [ ] **Step 4: Replace refresh eligibility expression**

Replace:

```ts
if (!user || user.status !== 'active' || user.tenant.status !== 'active' || (user.sessionVersion ?? 0) !== tokenVersion) {
  throw new UnauthorizedException('刷新令牌无效');
}
```

with:

```ts
if (!canRefreshSession(user, tokenVersion)) {
  throw new UnauthorizedException('刷新令牌无效');
}
```

- [ ] **Step 5: Remove private `toAuthUser()`**

Delete the private `toAuthUser()` method from `AuthService`. The pure helper owns that projection.

- [ ] **Step 6: Run focused auth tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.model.spec.ts src/auth/auth.service.spec.ts src/auth/jwt.strategy.spec.ts
```

Expected: PASS.

## Task 4: Verify, Review, And Commit

**Files:**
- Verify: `packages/backend/src/auth/auth.model.ts`
- Verify: `packages/backend/src/auth/auth.model.spec.ts`
- Verify: `packages/backend/src/auth/auth.service.ts`
- Verify: `docs/superpowers/plans/2026-07-09-p5-auth-session-boundary.md`

**Interfaces:**
- Produces: one committed P5 user-system reliability slice.

- [ ] **Step 1: Run backend gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
corepack pnpm@10.33.2 --filter @nongchang/backend build
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Request review**

Use a reviewer subagent to inspect the P5 diff against this plan. Fix Critical or Important findings before committing.

- [ ] **Step 3: Inspect, stage, and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p5-auth-session-boundary.md packages/backend/src/auth/auth.model.ts packages/backend/src/auth/auth.model.spec.ts packages/backend/src/auth/auth.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract auth session model helpers"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan addresses the authentication/session user-system boundary without changing I/O, JWT, bcrypt, WeChat, or query behavior.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: `AuthAccountSnapshot`, `RefreshAccountSnapshot`, `isKnownRole`, `toAuthUser`, and `canRefreshSession` are named consistently across tests, model, and service.
