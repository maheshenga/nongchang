# Verification Docs Linkage P7-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the P7 production verification gates to the project README and deployment guide so developers and operators find the same canonical verification path.

**Architecture:** Keep `docs/ops/production-verification.md` as the single detailed runbook. Update README with short local setup and script references, and update the Baota deployment guide with pre/post-deploy verification links and production safety reminders. Do not change product code or test behavior.

**Tech Stack:** Markdown documentation, pnpm workspace scripts, existing verification commands.

---

## Scope Boundary

This P7-B slice finishes the documentation-linkage gap found after P7:

- README still points local setup at `prisma:migrate`, while the e2e/preproduction flow uses `prisma:deploy`.
- README common scripts do not mention `verify:local`, `verify:production`, `test:unit`, or `test:e2e`.
- Baota deployment docs do not link to `docs/ops/production-verification.md`.
- Baota deployment docs do not explicitly call out the production `ALLOW_MANUAL_PAY=false` safety expectation.

This slice does not alter package scripts, CI, backend code, frontend code, database schema, or tests.

## File Structure

- Modify: `README.md`
  - Replace local migration command with `prisma:deploy`.
  - Add `verify:local`, `verify:production`, `test:unit`, `test:e2e`, and backend `e2e:check-db` to the common scripts table.
  - Link the deployment/verification sections to `docs/ops/production-verification.md`.
- Modify: `docs/deploy/baota.md`
  - Add a pre-deploy verification section linking to the production verification runbook.
  - Add a post-deploy verification section.
  - Add `ALLOW_MANUAL_PAY=false` to required production env values and safety reminders.
- Modify: `docs/superpowers/plans/2026-07-06-verification-docs-linkage-p7b.md`
  - This plan.

## Task 1: README Verification Linkage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace local migration command**

In the local development setup block, replace:

```bash
pnpm --filter @nongchang/backend prisma:migrate
```

with:

```bash
pnpm --filter @nongchang/backend prisma:deploy
```

Keep `pnpm --filter @nongchang/backend prisma:seed` immediately after it.

- [ ] **Step 2: Add verification scripts to the common script table**

In the common scripts table, keep existing rows and add these rows:

```markdown
| `pnpm test:unit` | Run shared build plus backend/web/miniapp unit suites |
| `pnpm test:e2e` | Run backend e2e after local PostGIS is running, migrated, and seeded |
| `pnpm verify:local` | Run production non-e2e gates: shared build, backend build, web lint, unit suites |
| `pnpm verify:production` | Run `verify:local` plus database-backed e2e |
| `pnpm --filter @nongchang/backend e2e:check-db` | Check local PostGIS, migrations, and seed data before e2e |
```

Because the file currently contains mojibake Chinese text, do not rewrite the whole README. Only add concise ASCII command descriptions so the commands remain searchable and unambiguous.

- [ ] **Step 3: Link the verification runbook**

In the deployment section, after the existing Baota deployment link, add:

```markdown
Release verification gates are documented in [docs/ops/production-verification.md](docs/ops/production-verification.md).
```

## Task 2: Baota Deployment Verification Linkage

**Files:**
- Modify: `docs/deploy/baota.md`

- [ ] **Step 1: Add a pre-deploy verification note before build commands**

Before the current “拉取代码并构建后端” command block, add:

````markdown
Before deploying a production-hardening branch, run the non-e2e gate from the repository root:

```bash
pnpm verify:local
```

For the full local release gate, including PostGIS e2e setup, follow [docs/ops/production-verification.md](../ops/production-verification.md).
````

- [ ] **Step 2: Add production manual-payment safety env**

In the required backend `.env` example, add:

```env
ALLOW_MANUAL_PAY=false
```

Keep the existing `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `PORT` lines.

- [ ] **Step 3: Add post-deploy verification**

After the optional seed command or before PM2 setup, add:

```markdown
After migrations finish and the service is restarted, run the deployment smoke checks from [docs/ops/production-verification.md](../ops/production-verification.md). Do not treat e2e as passing unless `pnpm test:e2e` exits `0` against a prepared PostGIS database.
```

- [ ] **Step 4: Add safety reminder for manual pay**

In the security reminders list, add:

```markdown
- Keep `ALLOW_MANUAL_PAY=false` in production. The backend env validator rejects `ALLOW_MANUAL_PAY=true` when `NODE_ENV=production`.
```

## Task 3: Documentation Verification

**Files:**
- Verify: `README.md`
- Verify: `docs/deploy/baota.md`
- Verify: `docs/ops/production-verification.md`

- [ ] **Step 1: Search for stale local migration guidance**

Run:

```powershell
rg -n "prisma:migrate|migrate dev" README.md docs/deploy/baota.md docs/ops/production-verification.md
```

Expected:
- `README.md` no longer contains `prisma:migrate`.
- `docs/deploy/baota.md` may still say production should not use `migrate dev`; that is acceptable as a warning.

- [ ] **Step 2: Verify new links and commands are present**

Run:

```powershell
rg -n "verify:local|verify:production|e2e:check-db|production-verification|ALLOW_MANUAL_PAY=false" README.md docs/deploy/baota.md docs/ops/production-verification.md
```

Expected:
- README includes `verify:local`, `verify:production`, `e2e:check-db`, and `production-verification`.
- Baota docs include `verify:local`, `production-verification`, and `ALLOW_MANUAL_PAY=false`.
- Ops runbook still includes `verify:local`, `verify:production`, and `e2e:check-db`.

- [ ] **Step 3: Run non-e2e verification gate**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: exit code `0`.

- [ ] **Step 4: Record e2e environment status**

Run:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

Expected in this environment if local PostGIS is not running: FAIL with `ECONNREFUSED 127.0.0.1:5544`. Record as an environment blocker and do not claim e2e passed.

## Task 4: Review and Commit

**Files:**
- Review changed docs and this plan.

- [ ] **Step 1: Request code review**

Ask one reviewer:

```text
Review P7-B verification docs linkage. Requirements: README points local setup to prisma:deploy rather than prisma:migrate; README lists verify:local, verify:production, test:unit, test:e2e, and backend e2e:check-db; README links docs/ops/production-verification.md; docs/deploy/baota.md links the verification runbook, includes pre/post deploy verification guidance, includes ALLOW_MANUAL_PAY=false in production env guidance, and warns production must keep manual pay disabled. No product logic, package scripts, CI, schema, or tests should change. Look for stale commands, broken relative links, misleading e2e claims, and mojibake-sensitive over-edits.
```

Fix Critical and Important findings before committing.

- [ ] **Step 2: Final diff check**

Run:

```powershell
git diff --check
git status --short
```

Expected: exit code `0` for `git diff --check`; status should only show README, Baota docs, and this plan. After staging, `git diff --cached --stat` should show the same files.

- [ ] **Step 3: Commit**

Run:

```powershell
git add README.md docs/deploy/baota.md docs/superpowers/plans/2026-07-06-verification-docs-linkage-p7b.md
git commit -m "docs: link production verification runbook"
```

Expected: commit succeeds on branch `codex/user-group-permissions-p2b`.

---

## Self-Review

- Spec coverage: The plan closes the remaining Phase 7 documentation-update gap by linking verification gates from README and deployment docs.
- Placeholder scan: No TODO/TBD/fill-later placeholders are present.
- Type consistency: Script names match P7 exactly: `verify:local`, `verify:production`, and `e2e:check-db`.
- Scope control: Documentation-only; no product logic, CI, package script, schema, or test changes.
