# P7 User Management Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic user-management permission and mutation helpers from `UserService` so tenant admin, agent admin, merchant, and member account rules are explicit and directly tested.

**Architecture:** `UserService` remains responsible for Prisma reads/writes, bcrypt, random initial password generation, and Nest exceptions. A new `user.model.ts` owns pure calculations: scoped `where` filters, create-time `agentId` decisions, merchant target filters, review status mapping, and status update payloads.

**Tech Stack:** NestJS service, Prisma mocks, Vitest, TypeScript, existing `@nongchang/shared` roles and DTO types.

## Global Constraints

- Do not change controller routes, DTO schemas, Prisma query shapes, selected response fields, random password generation, bcrypt hashing, or exception classes.
- Preserve tenant admin behavior: system/platform tenant admins can see tenant-wide users and can create merchants or ordinary members.
- Preserve agent admin behavior: agent admins require `actor.agentId`, can only create merchant accounts, and created merchants are forced to the actor agent.
- Preserve ordinary member behavior: member accounts always store `agentId: null`, even if DTO includes an `agentId`.
- Preserve merchant management behavior: update/setStatus/review target only merchant accounts inside the actor scope and exclude pending users from update/setStatus.
- Preserve session invalidation behavior: suspending a merchant increments `sessionVersion`; activating does not.
- New production code must follow TDD: failing tests first, verify RED, implement minimal code, verify GREEN.

---

## File Structure

- Create `packages/backend/src/modules/user/user.model.ts`
  - Pure helpers for scope and user-management decisions.
- Create `packages/backend/src/modules/user/user.model.spec.ts`
  - Direct tests for helper rules across system admin, agent admin, merchant, and member cases.
- Modify `packages/backend/src/modules/user/user.service.ts`
  - Replace inline logic with helper calls.
  - Keep all database existence checks and exception throwing in service.

---

### Task 1: Add User Model Helper Tests

**Files:**
- Create: `packages/backend/src/modules/user/user.model.spec.ts`

**Interfaces:**
- Consumes: `AuthUser`, `Role`, `CreateUserDto`, `ReviewUserInput`.
- Produces future exports:
  - `buildUserScopedWhere(actor: AuthUser): Record<string, string>`
  - `resolveCreateUserAgentId(actor: AuthUser, dto: Pick<CreateUserDto, 'role' | 'agentId'>): string | null`
  - `buildMerchantTargetWhere(actor: AuthUser, id: string, statusFilter: 'pending' | 'manageable'): Record<string, unknown>`
  - `buildUserStatusUpdateData(status: 'active' | 'suspended'): Record<string, unknown>`
  - `reviewActionToStatus(action: ReviewUserInput['action']): 'active' | 'rejected'`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  buildMerchantTargetWhere,
  buildUserScopedWhere,
  buildUserStatusUpdateData,
  resolveCreateUserAgentId,
  reviewActionToStatus,
} from './user.model';

const actor = (overrides: Partial<AuthUser>): AuthUser => ({
  userId: 'u1',
  tenantId: 't1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
  sessionVersion: 0,
  ...overrides,
});

describe('user.model scope helpers', () => {
  it('builds tenant-wide scope for tenant administrators', () => {
    expect(buildUserScopedWhere(actor({ role: Role.SYSTEM_ADMIN }))).toEqual({ tenantId: 't1' });
  });

  it('builds agent scope for agent administrators', () => {
    expect(buildUserScopedWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({
      tenantId: 't1',
      agentId: 'a1',
    });
  });

  it('rejects agent administrators without an agentId before querying', () => {
    expect(() => buildUserScopedWhere(actor({ role: Role.AGENT_ADMIN, agentId: null })))
      .toThrow(ForbiddenException);
  });

  it('builds pending merchant target filters inside actor scope', () => {
    expect(buildMerchantTargetWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }), 'm1', 'pending')).toEqual({
      tenantId: 't1',
      agentId: 'a1',
      id: 'm1',
      role: Role.MERCHANT,
      status: 'pending',
    });
  });

  it('builds manageable merchant target filters that exclude pending users', () => {
    expect(buildMerchantTargetWhere(actor({ role: Role.SYSTEM_ADMIN }), 'm1', 'manageable')).toEqual({
      tenantId: 't1',
      id: 'm1',
      role: Role.MERCHANT,
      status: { not: 'pending' },
    });
  });
});

describe('user.model create helpers', () => {
  it('forces member accounts to null agentId even when dto includes an agent', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.SYSTEM_ADMIN }),
      { role: Role.MEMBER, agentId: 'a9' },
    )).toBeNull();
  });

  it('lets tenant administrators assign a merchant agentId from dto', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.SYSTEM_ADMIN }),
      { role: Role.MERCHANT, agentId: 'a9' },
    )).toBe('a9');
  });

  it('defaults tenant-created merchant agentId to null', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.SYSTEM_ADMIN }),
      { role: Role.MERCHANT },
    )).toBeNull();
  });

  it('forces agent administrators to create merchants under their own agent', () => {
    expect(resolveCreateUserAgentId(
      actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }),
      { role: Role.MERCHANT, agentId: 'a9' },
    )).toBe('a1');
  });

  it('rejects agent administrators creating ordinary members', () => {
    expect(() => resolveCreateUserAgentId(
      actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }),
      { role: Role.MEMBER },
    )).toThrow(ForbiddenException);
  });

  it('rejects agent administrators without an agentId before creating users', () => {
    expect(() => resolveCreateUserAgentId(
      actor({ role: Role.AGENT_ADMIN, agentId: null }),
      { role: Role.MERCHANT },
    )).toThrow(ForbiddenException);
  });
});

describe('user.model status helpers', () => {
  it('increments sessionVersion when suspending a merchant', () => {
    expect(buildUserStatusUpdateData('suspended')).toEqual({
      status: 'suspended',
      sessionVersion: { increment: 1 },
    });
  });

  it('does not increment sessionVersion when activating a merchant', () => {
    expect(buildUserStatusUpdateData('active')).toEqual({ status: 'active' });
  });

  it('maps review approve/reject actions to stored statuses', () => {
    expect(reviewActionToStatus('approve')).toBe('active');
    expect(reviewActionToStatus('reject')).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.model.spec.ts`

Expected: FAIL because `./user.model` does not exist.

---

### Task 2: Implement User Model Helpers

**Files:**
- Create: `packages/backend/src/modules/user/user.model.ts`

**Interfaces:**
- Consumes: `AuthUser`, `CreateUserDto`, `ReviewUserInput`, `Role`.
- Produces helpers listed in Task 1.

- [ ] **Step 1: Write minimal implementation**

```typescript
import { ForbiddenException } from '@nestjs/common';
import { AuthUser, CreateUserDto, ReviewUserInput, Role } from '@nongchang/shared';

export function buildUserScopedWhere(actor: AuthUser): Record<string, string> {
  const where: Record<string, string> = { tenantId: actor.tenantId };
  if (actor.role === Role.AGENT_ADMIN) {
    if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
    where.agentId = actor.agentId;
  }
  return where;
}

export function resolveCreateUserAgentId(
  actor: AuthUser,
  dto: Pick<CreateUserDto, 'role' | 'agentId'>,
): string | null {
  if (dto.role === Role.MEMBER) return null;
  if (actor.role === Role.AGENT_ADMIN) {
    if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
    if (!actor.agentId) throw new ForbiddenException('Agent admin is missing agentId');
    return actor.agentId;
  }
  return dto.agentId ?? null;
}

export function buildMerchantTargetWhere(
  actor: AuthUser,
  id: string,
  statusFilter: 'pending' | 'manageable',
): Record<string, unknown> {
  return {
    ...buildUserScopedWhere(actor),
    id,
    role: Role.MERCHANT,
    status: statusFilter === 'pending' ? 'pending' : { not: 'pending' },
  };
}

export function buildUserStatusUpdateData(status: 'active' | 'suspended'): Record<string, unknown> {
  const data: Record<string, unknown> = { status };
  if (status === 'suspended') data.sessionVersion = { increment: 1 };
  return data;
}

export function reviewActionToStatus(action: ReviewUserInput['action']): 'active' | 'rejected' {
  return action === 'approve' ? 'active' : 'rejected';
}
```

- [ ] **Step 2: Run model tests to verify GREEN**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.model.spec.ts`

Expected: PASS.

---

### Task 3: Wire UserService to Helpers

**Files:**
- Modify: `packages/backend/src/modules/user/user.service.ts`
- Test: `packages/backend/src/modules/user/user.model.spec.ts`
- Test: `packages/backend/src/modules/user/user.service.spec.ts`

**Interfaces:**
- Consumes Task 2 helpers.
- Produces unchanged public `UserService` behavior.

- [ ] **Step 1: Add helper import**

```typescript
import {
  buildMerchantTargetWhere,
  buildUserScopedWhere,
  buildUserStatusUpdateData,
  resolveCreateUserAgentId,
  reviewActionToStatus,
} from './user.model';
```

- [ ] **Step 2: Replace inline user-management decisions**

Apply these service changes:

```typescript
async create(actor: AuthUser, dto: CreateUserDto) {
  const agentId = resolveCreateUserAgentId(actor, dto);
  if (agentId) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!agent) throw new ForbiddenException('Agent does not exist in the current tenant');
  }
  // keep password generation, hash, prisma.user.create, and return shape unchanged
}

private scopedWhere(actor: AuthUser): Record<string, string> {
  return buildUserScopedWhere(actor);
}

async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
  if (!id) throw new ForbiddenException('缺少用户 id');
  const target = await this.prisma.user.findFirst({ where: buildMerchantTargetWhere(actor, id, 'manageable') });
  // keep remaining update logic unchanged
}

async setStatus(actor: AuthUser, id: string, status: 'active' | 'suspended') {
  if (!id) throw new ForbiddenException('缺少用户 id');
  const target = await this.prisma.user.findFirst({ where: buildMerchantTargetWhere(actor, id, 'manageable') });
  if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
  return this.prisma.user.update({
    where: { id },
    data: buildUserStatusUpdateData(status),
    select: { id: true, status: true },
  });
}

async review(actor: AuthUser, userId: string, dto: ReviewUserInput) {
  const target = await this.prisma.user.findFirst({
    where: buildMerchantTargetWhere(actor, userId, 'pending'),
  });
  if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
  const status = reviewActionToStatus(dto.action);
  await this.prisma.user.update({ where: { id: userId }, data: { status } });
  return { id: userId, status };
}
```

- [ ] **Step 3: Run focused user tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.model.spec.ts src/modules/user/user.service.spec.ts src/common/scope/scope.service.spec.ts`

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

**Files:**
- Review: `docs/superpowers/plans/2026-07-09-p7-user-management-model-boundary.md`
- Review: `packages/backend/src/modules/user/user.model.ts`
- Review: `packages/backend/src/modules/user/user.model.spec.ts`
- Review: `packages/backend/src/modules/user/user.service.ts`

- [ ] **Step 1: Run full backend verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: build exits 0; backend unit suite passes; diff check has no errors other than possible CRLF warnings.

- [ ] **Step 2: Request code review**

Send the reviewer this scope:

```text
Review P7 user management model boundary. Ensure no route/DTO/Prisma select/random password/bcrypt/exception behavior changed. Verify system admins keep tenant-wide scope; agent admins require agentId and are scoped to that agent; members force agentId null; update/setStatus/review still target merchants only; setStatus suspended still increments sessionVersion and active does not.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p7-user-management-model-boundary.md packages/backend/src/modules/user/user.model.ts packages/backend/src/modules/user/user.model.spec.ts packages/backend/src/modules/user/user.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract user management model helpers"
```

Expected: commit succeeds after review issues are resolved.

---

## Self-Review

- Spec coverage: The plan covers admin/agent/member scope, create-time agent ownership, merchant target filters, review mapping, status session invalidation, service wiring, verification, review, and commit.
- Placeholder scan: No TBD/TODO/fill-in placeholders. All commands and code snippets are concrete.
- Type consistency: Helper names and signatures match across tests, implementation, and service wiring.
