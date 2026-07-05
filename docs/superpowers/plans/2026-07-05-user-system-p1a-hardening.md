# User System P1-A Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the highest-priority user-system authorization boundaries for agent-bound user creation and suspended agent access.

**Architecture:** Keep the current three-role model (`system_admin`, `agent_admin`, `merchant`) and make the existing contracts fail closed. `UserService.create()` validates agent ownership before assigning an agent. `AuthService` denies login and refresh when an `agent_admin` belongs to a suspended or missing agent. No new role or schema migration is introduced in this slice.

**Tech Stack:** NestJS, Prisma, Vitest, TypeScript, pnpm workspace, shared DTO/enums package.

---

## Scope

This plan implements only P1-A from the user-system analysis:

1. `agent_admin` cannot create a merchant when its token lacks `agentId`.
2. `system_admin` cannot create an agent-bound user with an `agentId` from another tenant or a missing agent.
3. `agent_admin` login is denied when the linked `Agent.status` is not `active`.
4. `agent_admin` refresh is denied when the linked `Agent.status` is not `active`, so agent suspension takes effect at refresh time.

This plan intentionally does not add a `member` role, tenant CRUD, real group-permission enforcement, or rejected WeChat re-application. Those are larger P2/P3 slices.

## File Structure

- Modify: `packages/backend/src/modules/user/user.service.ts`
  - Responsibility: Create users inside the caller tenant and agent scope; validate any `agentId` before using it.
- Modify: `packages/backend/src/modules/user/user.service.spec.ts`
  - Responsibility: Regression tests for agent-admin missing `agentId` and cross-tenant/missing `agentId` rejection.
- Modify: `packages/backend/src/auth/auth.service.ts`
  - Responsibility: Deny active sessions for suspended/missing agents during password login, WeChat login, and refresh.
- Modify: `packages/backend/src/auth/auth.service.spec.ts`
  - Responsibility: Regression tests for suspended/missing agent login and refresh.
- Create: `docs/superpowers/plans/2026-07-05-user-system-p1a-hardening.md`
  - Responsibility: This plan and execution checklist.

---

### Task 1: User Creation Agent Scope

**Files:**
- Modify: `packages/backend/src/modules/user/user.service.spec.ts`
- Modify: `packages/backend/src/modules/user/user.service.ts`

- [ ] **Step 1: Write failing tests for `UserService.create()` hard boundaries**

Add these tests inside the existing `UserService` merchant-management `describe(...)` block, near the existing create tests. Keep the test names in English in the actual file:

```typescript
  it('rejects agent_admin merchant creation when actor agentId is missing', async () => {
    const prisma = makePrisma();
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.create(ctx({ agentId: null }), { username: 'm10', role: Role.MERCHANT, displayName: 'Merchant 10' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('system_admin validates create dto agentId belongs to the current tenant', async () => {
    const prisma = makePrisma();
    prisma.agent = { findFirst: vi.fn().mockResolvedValue(null) };
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.create(sysAdmin, {
      username: 'm11',
      role: Role.MERCHANT,
      agentId: '00000000-0000-0000-0000-000000000011',
      displayName: 'Merchant 11',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: '00000000-0000-0000-0000-000000000011', tenantId: 't1' },
      select: { id: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts
```

Expected:
- The new missing-`agentId` test fails because current code creates a user with `agentId: null`.
- The new `system_admin` test fails because current code does not check `prisma.agent.findFirst()`.

- [ ] **Step 3: Implement minimal user creation hardening**

In `packages/backend/src/modules/user/user.service.ts`, replace the top of `create()` with:

```typescript
  async create(actor: AuthUser, dto: CreateUserDto) {
    let agentId = dto.agentId ?? null;
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('Agent admins can only create merchant accounts');
      if (!actor.agentId) throw new ForbiddenException('Agent admin is missing agentId');
      agentId = actor.agentId;
    }
    if (agentId) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: agentId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!agent) throw new ForbiddenException('Agent does not exist in the current tenant');
    }
```

Keep the existing password generation and `prisma.user.create()` block unchanged after this.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts
```

Expected:
- `src/modules/user/user.service.spec.ts` passes.
- No unrelated user-service regression is introduced.

---

### Task 2: Suspended Agent Login and Refresh

**Files:**
- Modify: `packages/backend/src/auth/auth.service.spec.ts`
- Modify: `packages/backend/src/auth/auth.service.ts`

- [ ] **Step 1: Write failing tests for suspended/missing agent access**

Add tests under the existing AuthService login/refresh describes:

```typescript
  it('rejects password login when agent_admin linked agent is suspended', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 't1', status: 'active' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-agent',
      tenantId: 't1',
      username: 'agent',
      role: Role.AGENT_ADMIN,
      agentId: 'a-suspended',
      status: 'active',
      passwordHash: await bcrypt.hash('secret123', 10),
    });
    prisma.agent = { findFirst: vi.fn().mockResolvedValue({ id: 'a-suspended', status: 'suspended' }) };
    const svc = makeService(prisma);
    await expect(svc.login({ tenantCode: 'tenant-a', username: 'agent', password: 'secret123' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects refresh when agent_admin linked agent is missing', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-agent',
      tenantId: 't1',
      role: Role.AGENT_ADMIN,
      agentId: 'a-missing',
      status: 'active',
      tenant: { status: 'active' },
    });
    prisma.agent = { findFirst: vi.fn().mockResolvedValue(null) };
    const svc = makeService(prisma);
    await expect(svc.refresh('valid-refresh')).rejects.toBeInstanceOf(ForbiddenException);
  });
```

If the existing test helpers have different names, use the existing helper equivalents in `auth.service.spec.ts`, keeping the same assertions and data shape.

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/auth/auth.service.spec.ts
```

Expected:
- The login test fails because current login does not inspect `Agent.status`.
- The refresh test fails because current refresh does not inspect `Agent.status`.

- [ ] **Step 3: Implement reusable active-agent assertion**

In `packages/backend/src/auth/auth.service.ts`, add a private method before `toAuthUser()`:

```typescript
  private async assertActiveAgent(user: { tenantId: string; role: string; agentId: string | null }) {
    if (user.role !== Role.AGENT_ADMIN) return;
    if (!user.agentId) throw new ForbiddenException('Agent admin ownership is invalid');
    const agent = await this.prisma.agent.findFirst({
      where: { id: user.agentId, tenantId: user.tenantId },
      select: { status: true },
    });
    if (!agent || agent.status !== 'active') throw new ForbiddenException('Linked agent is suspended');
  }
```

- [ ] **Step 4: Call the assertion during login and refresh**

In password login, after user and tenant status checks and before issuing tokens, call:

```typescript
    await this.assertActiveAgent(user);
```

In WeChat login, after user and tenant status checks and before issuing tokens, call:

```typescript
    await this.assertActiveAgent(user);
```

In refresh, after `!user || user.status !== 'active' || user.tenant.status !== 'active'` check and before issuing tokens, call:

```typescript
    await this.assertActiveAgent(user);
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/auth/auth.service.spec.ts
```

Expected:
- `src/auth/auth.service.spec.ts` passes.
- Existing merchant/system admin token behavior remains unchanged.

---

### Task 3: Verification, Review, and Commit

**Files:**
- Modify: all files changed by Tasks 1-2

- [ ] **Step 1: Build shared package**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
```

Expected: exit code 0.

- [ ] **Step 2: Build backend**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: exit code 0.

- [ ] **Step 3: Run full unit suite**

Run:

```powershell
corepack pnpm@10.33.2 test:unit
```

Expected:
- backend tests pass.
- web tests pass.
- miniapp tests pass.

- [ ] **Step 4: Run mechanical diff checks**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/user-system-p1a-hardening diff --check
git -c safe.directory=E:/code/nongchang/.worktrees/user-system-p1a-hardening diff --stat
git -c safe.directory=E:/code/nongchang/.worktrees/user-system-p1a-hardening diff
```

Expected:
- `diff --check` exits 0.
- Diff is limited to the plan file plus auth/user service and specs.

- [ ] **Step 5: Local code review**

Review the final diff for:
- Missing tenant filters on any new `agent` lookup.
- New paths that throw broader access instead of fail-closed denial.
- Any behavior beyond P1-A scope.
- Test names and assertions matching the security boundary.

- [ ] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/user-system-p1a-hardening add docs/superpowers/plans/2026-07-05-user-system-p1a-hardening.md packages/backend/src/modules/user/user.service.ts packages/backend/src/modules/user/user.service.spec.ts packages/backend/src/auth/auth.service.ts packages/backend/src/auth/auth.service.spec.ts
git -c safe.directory=E:/code/nongchang/.worktrees/user-system-p1a-hardening commit -m "fix(user): harden agent-scoped account boundaries"
```

Expected:
- Commit succeeds on branch `codex/user-system-p1a-hardening`.

---

## Self-Review

- Spec coverage: The four P1-A requirements map to Task 1 and Task 2. Verification, local review, and commit map to Task 3.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps are present.
- Type consistency: The plan uses existing `AuthUser`, `Role`, `CreateUserDto`, `ForbiddenException`, `UnauthorizedException`, `UserService`, and `AuthService` names.
- Scope control: No schema migration, role expansion, or UI changes are planned in this slice.
