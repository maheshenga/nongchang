# Credit Idempotency P4-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trace-code credit consumption idempotent.

**Architecture:** Add an optional ledger idempotency key and keep the existing balance/ledger model. Do not add a reservation state machine in this slice.

**Tech Stack:** pnpm 10.33.2, NestJS, Prisma, Vitest, PostgreSQL.

---

## Task 1: Ledger Idempotency

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260704090000_credit_ledger_idempotency/migration.sql`

- [ ] Write a failing test: same consume idempotency key returns old ledger and does not decrement again.
- [ ] Add `idempotencyKey?: string` to consume refs.
- [ ] Check existing ledger inside the same transaction before decrementing.
- [ ] Add Prisma field and SQL migration.
- [ ] Run backend billing tests.

## Task 2: Trace Generation Idempotency

**Files:**
- Modify: `packages/backend/src/modules/trace/trace.service.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.service.ts`

- [ ] Write a failing test: repeated same trace generation call sends the same idempotency key to billing.
- [ ] Derive the key from tenant, user, batch, and count.
- [ ] Run trace tests.

## Task 3: Audit SQL

**Files:**
- Create: `docs/ops/credit-ledger-audit.sql`

- [ ] Add SQL for consume rows with no matching refund.
- [ ] Keep it read-only.

## Task 4: Final Verification

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/billing/billing.service.spec.ts src/modules/trace/trace.service.spec.ts src/modules/ai/ai.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 test:unit
git -c safe.directory=E:/code/nongchang/.worktrees/credit-idempotency-p4a status --short
```
