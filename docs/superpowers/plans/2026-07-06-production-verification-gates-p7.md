# Production Verification Gates P7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase 7 production-hardening verification gates executable and documented from one place so local operators and CI run the same checks before release.

**Architecture:** Add root package scripts that encode the non-e2e and full production verification commands from the roadmap. Keep e2e database readiness in the existing backend precheck, expose that precheck as a named script, and document the exact local PostGIS preparation flow plus the coverage matrix for Phases 1-6.

**Tech Stack:** pnpm 10.33.2 workspace scripts, GitHub Actions, backend tsx e2e precheck, Markdown ops documentation.

---

## Scope Boundary

This P7 slice implements the final verification/deployment-documentation step from `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

It does not add new product behavior. The earlier phases already added or updated the business tests. P7 centralizes the commands, makes CI consume the same command set, and records the authoritative evidence matrix.

## File Structure

- Modify: `package.json`
  - Add `verify:local` for all non-e2e production gates.
  - Add `verify:production` for `verify:local` plus `test:e2e`.
- Modify: `packages/backend/package.json`
  - Add `e2e:check-db` for the existing `tsx test/check-e2e-db.ts` precheck.
  - Keep `test:e2e` using the precheck before Vitest.
- Modify: `.github/workflows/ci.yml`
  - Replace the separate backend build, web typecheck, and unit-test steps with `pnpm verify:local`.
  - Keep migration/seed before e2e and keep `pnpm test:e2e` as the database-backed gate.
- Create: `docs/ops/production-verification.md`
  - Document the exact local verification commands.
  - Document PostGIS startup, migration, seed, and e2e troubleshooting.
  - Include a Phase 1-6 coverage matrix with concrete test files.

## Task 1: Add Workspace Verification Scripts

**Files:**
- Modify: `package.json`
- Modify: `packages/backend/package.json`

- [ ] **Step 1: Verify RED for missing root verification script**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected before implementation: FAIL with a missing-script error for `verify:local`.

- [ ] **Step 2: Add root scripts**

In root `package.json`, update `scripts` to include:

```json
"verify:local": "pnpm --filter @nongchang/shared build && pnpm --filter @nongchang/backend build && pnpm --filter web lint && pnpm test:unit",
"verify:production": "pnpm verify:local && pnpm test:e2e"
```

Keep the existing `test:unit` and `test:e2e` scripts unchanged so current developer commands continue to work.

- [ ] **Step 3: Add backend e2e precheck script**

In `packages/backend/package.json`, add:

```json
"e2e:check-db": "tsx test/check-e2e-db.ts"
```

Keep `test:e2e` as:

```json
"test:e2e": "prisma generate && tsx test/check-e2e-db.ts && vitest run -c vitest.e2e.config.ts"
```

- [ ] **Step 4: Verify GREEN for local gates**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: exit code `0`.

- [ ] **Step 5: Verify e2e precheck remains explicit**

Run:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

Expected in this environment if local PostGIS is not running: FAIL with `[e2e precheck] Cannot reach PostgreSQL/PostGIS at 127.0.0.1:5544.` Record this as an environment blocker, not a product failure.

## Task 2: Align CI With Verification Scripts

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace duplicated non-e2e CI steps**

In `.github/workflows/ci.yml`, after `Seed database`, replace these separate steps:

```yaml
- name: Backend build (typecheck via nest build)
  env:
    DATABASE_URL: postgresql://unit:unit@127.0.0.1:1/unit?schema=public
  run: pnpm build:backend

- name: Web typecheck
  run: pnpm --filter web lint

- name: Unit tests
  env:
    DATABASE_URL: postgresql://unit:unit@127.0.0.1:1/unit?schema=public
  run: pnpm test:unit
```

with:

```yaml
- name: Production verification gates (non-e2e)
  env:
    DATABASE_URL: postgresql://unit:unit@127.0.0.1:1/unit?schema=public
  run: pnpm verify:local
```

Keep the existing `Backend e2e tests` step:

```yaml
- name: Backend e2e tests
  env:
    DATABASE_URL: postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public
  run: pnpm test:e2e
```

- [ ] **Step 2: Verify workflow syntax by inspection and command parity**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: exit code `0`. This proves the CI replacement command exists and runs locally.

## Task 3: Add Production Verification Documentation

**Files:**
- Create: `docs/ops/production-verification.md`

- [ ] **Step 1: Create the ops document**

Create `docs/ops/production-verification.md` with:

````markdown
# Production Verification Gates

This document is the release checklist for the production-hardening roadmap in `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

## Local Non-E2E Gate

Run before committing production-hardening changes:

```powershell
corepack pnpm@10.33.2 verify:local
```

This expands to:

- `corepack pnpm@10.33.2 --filter @nongchang/shared build`
- `corepack pnpm@10.33.2 --filter @nongchang/backend build`
- `corepack pnpm@10.33.2 --filter web lint`
- `corepack pnpm@10.33.2 test:unit`

## Full Production Gate

Start the local PostGIS database:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Prepare the database:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
```

Run the full gate:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 verify:production
```

To check database readiness without running all e2e tests:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

## E2E Blocker Interpretation

If the precheck says it cannot reach `127.0.0.1:5544`, the local database is not running or is not mapped to the expected port. Start Docker Compose and rerun migrations/seed. Do not report e2e as passing until `corepack pnpm@10.33.2 test:e2e` exits `0`.

## Phase 1-6 Coverage Matrix

| Roadmap item | Evidence |
| --- | --- |
| Supply issuance sends the selected `batchId`; merchant-scoped supply management is enforced; system admin mutation paths remain constrained by backend authorization | `packages/web/src/api/supply.spec.ts`, `packages/backend/src/modules/supply/supply.service.spec.ts`, `packages/backend/test/supply.e2e-spec.ts` |
| Production navigation does not expose demo dashboards or simulated mobile flows by default | `packages/web/src/navigation.spec.ts`, `packages/web/src/App.spec.tsx` |
| Settings no longer presents unimplemented IoT/blockchain/push features as active system capabilities | `packages/web/src/components/Settings.spec.tsx`, `packages/web/src/App.spec.tsx` |
| User group permission behavior matches the enforced `PermissionsGuard` design | `packages/backend/src/common/guards/permissions.guard.spec.ts`, `packages/backend/src/modules/farm-record/farm-record.controller.spec.ts`, `packages/backend/src/modules/field/field.controller.spec.ts`, `packages/backend/src/modules/batch/batch.controller.spec.ts`, `packages/backend/src/modules/trace/trace.controller.spec.ts`, `packages/web/src/components/UserGroups.spec.tsx` |
| Credit reservation behavior prevents duplicate charges and releases failed operations | `packages/backend/src/modules/billing/billing.service.spec.ts`, `packages/backend/src/modules/trace/trace.service.spec.ts`, `packages/backend/src/modules/ai/ai.service.spec.ts`, `docs/ops/credit-ledger-audit.sql` |
| WeChat tenant-scoped OpenID behavior is covered | `packages/backend/src/auth/auth.service.spec.ts`, `packages/backend/test/integration-wechat.e2e-spec.ts`, `packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql` |
| Session revocation rejects stale, disabled-user, and disabled-tenant tokens | `packages/backend/src/auth/jwt.strategy.spec.ts`, `packages/backend/src/auth/auth.service.spec.ts`, `packages/backend/src/modules/user/user.service.spec.ts` |
````

- [ ] **Step 2: Verify every matrix file exists**

Run:

```powershell
Test-Path packages/web/src/api/supply.spec.ts
Test-Path packages/backend/src/modules/supply/supply.service.spec.ts
Test-Path packages/backend/test/supply.e2e-spec.ts
Test-Path packages/web/src/navigation.spec.ts
Test-Path packages/web/src/App.spec.tsx
Test-Path packages/web/src/components/Settings.spec.tsx
Test-Path packages/backend/src/common/guards/permissions.guard.spec.ts
Test-Path packages/backend/src/modules/farm-record/farm-record.controller.spec.ts
Test-Path packages/backend/src/modules/field/field.controller.spec.ts
Test-Path packages/backend/src/modules/batch/batch.controller.spec.ts
Test-Path packages/backend/src/modules/trace/trace.controller.spec.ts
Test-Path packages/web/src/components/UserGroups.spec.tsx
Test-Path packages/backend/src/modules/billing/billing.service.spec.ts
Test-Path packages/backend/src/modules/trace/trace.service.spec.ts
Test-Path packages/backend/src/modules/ai/ai.service.spec.ts
Test-Path docs/ops/credit-ledger-audit.sql
Test-Path packages/backend/src/auth/auth.service.spec.ts
Test-Path packages/backend/test/integration-wechat.e2e-spec.ts
Test-Path packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql
Test-Path packages/backend/src/auth/jwt.strategy.spec.ts
Test-Path packages/backend/src/modules/user/user.service.spec.ts
```

Expected: every command prints `True`.

## Task 4: Final Verification, Review, and Commit

**Files:**
- Review all changed files.

- [ ] **Step 1: Run final verification gates**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 test:e2e
git diff --check
```

Expected:
- `verify:local` exits `0`.
- `git diff --check` exits `0`.
- e2e commands exit `0` only if local PostgreSQL/PostGIS is running and prepared. If blocked by `ECONNREFUSED 127.0.0.1:5544`, record that exact environment blocker and do not claim e2e passed.

- [ ] **Step 2: Request code review**

Ask a reviewer to check:

```text
Review P7 production verification gates. Requirements: root scripts expose verify:local and verify:production; backend exposes e2e:check-db; CI runs the same non-e2e gate script and still runs database-backed e2e after migrate/seed; docs/ops/production-verification.md documents local PostGIS setup, migrations, seed, full verification, e2e blocker interpretation, and a coverage matrix for Phase 1-6 acceptance criteria. Look for command drift, broken Windows/CI script syntax, inaccurate test coverage claims, and missing verification.
```

Fix Critical and Important findings before committing.

- [ ] **Step 3: Commit**

Run:

```powershell
git add package.json packages/backend/package.json .github/workflows/ci.yml docs/ops/production-verification.md docs/superpowers/plans/2026-07-06-production-verification-gates-p7.md
git commit -m "chore: document production verification gates"
```

Expected: commit succeeds on branch `codex/user-group-permissions-p2b`.

---

## Self-Review

- Spec coverage: Phase 7 required commands are represented by scripts and docs, and CI uses the non-e2e gate.
- Placeholder scan: No TODO/TBD/fill-later placeholders are present.
- Type consistency: Script names are `verify:local`, `verify:production`, and `e2e:check-db` across package scripts, CI, and docs.
- Scope control: No product behavior changes, no new database schema, and no weakening of e2e requirements.
