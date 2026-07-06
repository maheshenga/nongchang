# P0 Mainline Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current mainline buildable and bring the already-completed security hardening chain into a verifiable branch without including unrelated local workspace edits.

**Architecture:** Work in an isolated worktree on `codex/p0-mainline-stabilization`. First integrate the existing hardening branch `codex/user-group-permissions-p2b`, then resolve any compile or merge fallout with focused tests. Preserve existing backend API contracts unless the hardening branch already introduced compatible migrations/contracts.

**Tech Stack:** pnpm workspace, TypeScript, React/Vite web app, NestJS backend, Prisma schema/migrations, Vitest/Jest-style unit suites.

---

## File Structure

- Modify by merge: backend billing/auth/authz/trace files already changed on `codex/user-group-permissions-p2b`.
- Modify if needed: `packages/web/src/App.tsx` to handle `platform_admin` safely in shell navigation.
- Modify if needed: `packages/web/src/navigation.ts` to include a platform-admin navigation role or normalize it intentionally.
- Test if needed: existing web/backend tests adjacent to changed modules.
- Create: `docs/superpowers/plans/2026-07-06-p0-mainline-stabilization.md` to document this P0 execution plan.

## Success Criteria

- `codex/user-group-permissions-p2b` is merged or equivalently integrated into `codex/p0-mainline-stabilization`.
- Web TypeScript no longer fails on `platform_admin` role handling.
- Unit verification is run freshly with `corepack pnpm@10.33.2 test:unit`.
- Any database-dependent e2e check is reported separately if local Postgres/PostGIS is unavailable.
- Commit contains only P0-related changes from the isolated worktree.

---

### Task 1: Integrate Existing Hardening Chain

**Files:**
- Modify by merge: all files changed between `main` and `codex/user-group-permissions-p2b`
- Verify: git merge output and conflict list

- [ ] **Step 1: Confirm branch ancestry**

Run:

```powershell
git -c safe.directory=E:/code/nongchang -C E:/code/nongchang/.worktrees/p0-mainline-stabilization merge-base --is-ancestor codex/user-group-permissions-p2b HEAD
```

Expected: non-zero exit code, confirming the hardening branch is not already in this P0 branch.

- [ ] **Step 2: Merge hardening branch**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization merge --no-ff codex/user-group-permissions-p2b -m "merge hardening fixes for p0 stabilization"
```

Expected: merge succeeds or reports conflicts. If conflicts occur, resolve only by preserving hardening behavior and current mainline public contracts.

- [ ] **Step 3: Inspect resulting diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization status --short
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization diff --stat HEAD~1..HEAD
```

Expected: a merge commit exists and no unresolved conflict markers remain.

---

### Task 2: Fix Web Platform Admin Role Compile Blocker

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify if needed: `packages/web/src/navigation.ts`
- Test if needed: `packages/web/src/App.test.tsx` or existing web test file matching current project style

- [ ] **Step 1: Write or identify failing verification**

Run:

```powershell
node_modules/.bin/tsc.cmd -p packages/web/tsconfig.json --noEmit
```

Expected before fix: TypeScript fails because `platform_admin` is not assignable to `SystemRole`.

- [ ] **Step 2: Implement minimal role normalization**

Preferred behavior:

```typescript
const systemRole: SystemRole | null = user
  ? user.role === 'merchant'
    ? 'merchant_admin'
    : user.role === 'platform_admin'
      ? 'system_admin'
      : user.role
  : null;
```

If the merged hardening branch already introduced platform-specific navigation, keep that richer behavior instead and verify `platform_admin` has a defined `NAV_BY_ROLE` entry.

- [ ] **Step 3: Prevent stale mounted tabs across auth/role changes**

If not already fixed by the merge, reset mounted tabs when `navRole` changes:

```typescript
useEffect(() => {
  const fallbackTab = firstAllowedTab(navRole, activeTab);
  setMountedTabs(new Set([fallbackTab]));
  if (fallbackTab !== activeTab) setActiveTab(fallbackTab);
}, [navRole]);
```

Adapt to avoid infinite effects and preserve current project hook style.

- [ ] **Step 4: Verify web compile**

Run:

```powershell
node_modules/.bin/tsc.cmd -p packages/web/tsconfig.json --noEmit
```

Expected: exit code 0.

---

### Task 3: Run P0 Verification

**Files:**
- No source file changes expected

- [ ] **Step 1: Run unit suite**

Run:

```powershell
corepack pnpm@10.33.2 test:unit
```

Expected: backend, web, and miniapp unit suites pass. If failure is unrelated to P0, capture exact output and fix only if it blocks P0 confidence.

- [ ] **Step 2: Run e2e DB precheck if script exists**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsx test/check-e2e-db.ts
```

Expected: pass if local Postgres/PostGIS is available. If it fails with connection refused to the local test DB, report as environment-blocked rather than product-passing.

- [ ] **Step 3: Review diff scope**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization status --short
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization diff --stat main...HEAD
```

Expected: only hardening-chain, P0 role/build fixes, and this plan are present.

---

### Task 4: Review and Commit P0

**Files:**
- Stage all P0-related files in the isolated worktree only.

- [ ] **Step 1: Request review**

Dispatch a reviewer with:

```text
Description: P0 mainline stabilization merged the existing hardening branch and fixed remaining platform-admin web compile fallout.
Requirements: preserve hardening behavior, keep web compile green, do not include unrelated root workspace edits.
Base: main
Head: current HEAD
```

Expected: reviewer finds no Critical or Important issues. Fix valid Critical/Important issues before continuing.

- [ ] **Step 2: Commit final P0 integration if needed**

If merge commit plus plan/fixes are not already committed, run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization add docs/superpowers/plans/2026-07-06-p0-mainline-stabilization.md packages/web/src/App.tsx packages/web/src/navigation.ts
git -c safe.directory=E:/code/nongchang/.worktrees/p0-mainline-stabilization -C E:/code/nongchang/.worktrees/p0-mainline-stabilization commit -m "fix: stabilize p0 mainline hardening"
```

Expected: commit succeeds. If there are no staged changes because all changes are already in the merge commit except the plan, commit the plan separately with `docs: add p0 stabilization plan`.

- [ ] **Step 3: Prepare next P**

After P0 commit and verification, start P1 plan before touching P1 code.

---

### Task 5: Close AI Reservation Idempotency Review Gap

**Files:**
- Modify: `packages/shared/src/dto/ai.dto.ts`
- Modify: `packages/backend/src/modules/ai/ai.controller.ts`
- Modify: `packages/backend/src/modules/ai/ai.service.ts`
- Test: `packages/backend/src/modules/ai/ai.service.spec.ts`

- [ ] **Step 1: Write failing tests for repeated AI calls**

Add tests proving identical `chat`, `ask`, `diagnose`, `transcribe`, and `advice` calls create different reservation idempotency keys. Repeated payloads must not reuse a confirmed reservation unless response replay/cache semantics exist.

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/ai/ai.service.spec.ts
```

Expected before fix: at least one test fails because repeated calls reuse the same payload-derived reservation key.

- [ ] **Step 2: Replace payload-derived reservation keys with operation keys**

Use a helper with this behavior:

```typescript
private operationKey(kind: string, user: AuthUser): string {
  const raw = randomUUID();
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return `${kind}:${user.tenantId}:${user.userId}:${digest}`;
}
```

For `advice`, include `refId: input.batchId` but do not make `batchId` the idempotency key.

- [ ] **Step 3: Keep JSON AI DTOs unchanged**

Do not add a client-supplied idempotency field for AI in this P0 fix. A future client retry idempotency feature must include durable response replay/cache semantics.

- [ ] **Step 4: Verify targeted and full P0 tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/ai/ai.service.spec.ts
corepack pnpm@10.33.2 test:unit
```

Expected: targeted AI tests and full unit suite pass.
