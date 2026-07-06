# Production Safe Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent demo credentials and demo quota data from being seeded into production unless an explicit demo-seed override is set.

**Architecture:** Keep the Prisma seed as a demo seed, but move the production safety decision into a small pure helper under `src/common/seed`. The direct `prisma/seed.ts` entry point must fail before opening a Prisma connection in production unless `ALLOW_DEMO_SEED=true`; package scripts add an explicit `prisma:seed:demo` alias while preserving `prisma:seed` through a cross-platform wrapper that sets the flag.

**Tech Stack:** TypeScript, Vitest, Prisma, tsx, pnpm workspace scripts.

## Global Constraints

- Worktree: `E:\code\nongchang\.worktrees\saas-audit-priority-fixes`.
- Do not commit `.superpowers/`.
- Use TDD: write failing tests before production code.
- Use `corepack pnpm@10.33.2 ...` commands.
- Use `apply_patch` for all hand edits.
- Keep existing demo seed data unchanged except for adding the guard.
- Guard direct `tsx prisma/seed.ts` usage, not only package scripts.
- Avoid shell-specific inline environment syntax in `package.json` scripts because the project is worked on from Windows PowerShell.

---

### Task 15: Production-Safe Demo Seed Guard

**Files:**
- Create: `packages/backend/src/common/seed/seed-guard.ts`
- Create: `packages/backend/src/common/seed/seed-guard.spec.ts`
- Create: `packages/backend/scripts/run-demo-seed.ts`
- Modify: `packages/backend/prisma/seed.ts`
- Modify: `packages/backend/package.json`

**Interfaces:**
- Produces: `shouldAllowDemoSeed(env?: NodeJS.ProcessEnv): boolean`
- Produces: `assertDemoSeedAllowed(env?: NodeJS.ProcessEnv): void`
- Consumes: `assertDemoSeedAllowed()` from `packages/backend/prisma/seed.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/src/common/seed/seed-guard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertDemoSeedAllowed, shouldAllowDemoSeed } from './seed-guard';

describe('demo seed production guard', () => {
  it('blocks direct demo seeding in production without explicit override', () => {
    const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

    expect(shouldAllowDemoSeed(env)).toBe(false);
    expect(() => assertDemoSeedAllowed(env)).toThrow(/ALLOW_DEMO_SEED=true/);
  });

  it('allows demo seeding in production when ALLOW_DEMO_SEED is explicitly true', () => {
    const env = { NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' } as NodeJS.ProcessEnv;

    expect(shouldAllowDemoSeed(env)).toBe(true);
    expect(() => assertDemoSeedAllowed(env)).not.toThrow();
  });

  it('allows demo seeding outside production without an override', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

    expect(shouldAllowDemoSeed(env)).toBe(true);
    expect(() => assertDemoSeedAllowed(env)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/seed/seed-guard.spec.ts
```

Expected: FAIL because `./seed-guard` does not exist.

- [ ] **Step 3: Write the minimal guard implementation**

Create `packages/backend/src/common/seed/seed-guard.ts`:

```ts
export function shouldAllowDemoSeed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.ALLOW_DEMO_SEED === 'true';
}

export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (!shouldAllowDemoSeed(env)) {
    throw new Error(
      '[seed guard] Refusing to run demo seed in production. Set ALLOW_DEMO_SEED=true only for an intentional demo-data load.',
    );
  }
}
```

- [ ] **Step 4: Wire the guard into the direct Prisma seed entry point**

Modify `packages/backend/prisma/seed.ts` so the guard runs before `new PrismaClient()`:

```ts
import { assertDemoSeedAllowed } from '../src/common/seed/seed-guard';

assertDemoSeedAllowed();

const prisma = new PrismaClient();
```

- [ ] **Step 5: Add a cross-platform demo seed wrapper**

Create `packages/backend/scripts/run-demo-seed.ts`:

```ts
process.env.ALLOW_DEMO_SEED = 'true';

await import('../prisma/seed');
```

- [ ] **Step 6: Split package scripts without breaking existing local docs**

Modify `packages/backend/package.json`:

```json
"prisma:seed": "tsx scripts/run-demo-seed.ts",
"prisma:seed:demo": "tsx scripts/run-demo-seed.ts",
```

- [ ] **Step 7: Verify the focused tests pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/seed/seed-guard.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Prove the direct production seed fails before DB access**

Run:

```powershell
$env:NODE_ENV='production'; Remove-Item Env:\ALLOW_DEMO_SEED -ErrorAction SilentlyContinue; corepack pnpm@10.33.2 --filter @nongchang/backend exec tsx prisma/seed.ts; Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
```

Expected: non-zero exit with an error containing `ALLOW_DEMO_SEED=true`.

- [ ] **Step 9: Run full backend verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
corepack pnpm@10.33.2 --filter @nongchang/backend build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 10: Request review and commit**

Request a task-scoped review against the Task 15 diff. If no Critical or Important findings remain, stage only Task 15 files and commit:

```powershell
git add docs/superpowers/plans/2026-07-07-task-15-production-safe-seed.md packages/backend/src/common/seed/seed-guard.ts packages/backend/src/common/seed/seed-guard.spec.ts packages/backend/scripts/run-demo-seed.ts packages/backend/prisma/seed.ts packages/backend/package.json
git commit -m "chore(seed): guard demo credentials in production"
```
