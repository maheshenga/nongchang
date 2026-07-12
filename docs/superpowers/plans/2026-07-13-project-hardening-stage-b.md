# Project Hardening Stage B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI credit charging reconcilable, enforce tenant/owner consistency in PostgreSQL, and prove the complete database-backed production gate.

**Architecture:** Add a durable AI operation state machine coordinated with existing credit reservations. Use ordinary tenant foreign keys plus PostgreSQL constraint triggers for cross-table ownership invariants, then prove them with direct-SQL E2E tests against PostGIS.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL 16/PostGIS 3.4, Vitest, Docker Compose.

## Global Constraints

- Never persist AI prompts, images, audio, provider credentials, or provider response bodies in reconciliation records.
- An ambiguous `IN_FLIGHT` AI operation must not be automatically released.
- Existing trace-code reservation recovery must continue confirming reservations when generated codes exist.
- All new tenant foreign keys use `ON DELETE RESTRICT ON UPDATE CASCADE`.
- Cross-table trigger errors must use stable constraint names.
- No E2E pass may be claimed unless `pnpm verify:production` exits `0` against the prepared PostGIS database.

---

## File Structure

- `packages/backend/src/modules/billing/ai-operation.model.ts`: pure transition and recovery decisions.
- `packages/backend/src/modules/billing/ai-operation.model.spec.ts`: state-machine tests.
- `packages/backend/src/modules/billing/ai-billing-coordinator.ts`: external-call/reservation coordinator and stale reconciliation.
- `packages/backend/src/modules/billing/ai-billing-coordinator.spec.ts`: coordinator failure-window tests.
- `packages/backend/src/modules/billing/billing.service.ts`: skip AI operations in generic stale release.
- `packages/backend/src/modules/ai/ai.service.ts`: delegate paid calls to the coordinator.
- `packages/backend/prisma/schema.prisma`: AI operation and tenant relations.
- `packages/backend/prisma/migrations/20260713090000_ai_operation_reconciliation/migration.sql`: AI operation schema.
- `packages/backend/prisma/migrations/20260713100000_tenant_consistency_constraints/migration.sql`: tenant FKs and constraint triggers.
- `packages/backend/prisma/audit-data-consistency.sql`: preflight diagnostics matching database constraints.
- `packages/backend/test/ai-reconciliation.e2e-spec.ts`: database-backed recovery behavior.
- `packages/backend/test/tenant-constraints.e2e-spec.ts`: direct inconsistent-write rejection.
- `packages/backend/test/web-session.e2e-spec.ts`: cookie session integration.

### Task 1: Define the AI operation state machine and persistence model

**Files:**
- Create: `packages/backend/src/modules/billing/ai-operation.model.ts`
- Create: `packages/backend/src/modules/billing/ai-operation.model.spec.ts`
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260713090000_ai_operation_reconciliation/migration.sql`

**Interfaces:**
- Produces: `AiOperationStatus` Prisma enum.
- Produces: `recoveryActionForAiOperation(status): 'release' | 'confirm' | 'review' | 'skip'`.
- Produces: `toAiOperationErrorCategory(error): string` with no secret-bearing message persistence.

- [ ] **Step 1: Write state-machine tests**

Create `ai-operation.model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { recoveryActionForAiOperation, toAiOperationErrorCategory } from './ai-operation.model';

describe('recoveryActionForAiOperation', () => {
  it.each([
    ['RESERVED', 'release'],
    ['FAILED', 'release'],
    ['SUCCEEDED', 'confirm'],
    ['IN_FLIGHT', 'review'],
    ['REVIEW_REQUIRED', 'review'],
    ['CONFIRMED', 'skip'],
    ['RELEASED', 'skip'],
  ] as const)('maps %s to %s', (status, action) => {
    expect(recoveryActionForAiOperation(status)).toBe(action);
  });
});

describe('toAiOperationErrorCategory', () => {
  it('stores only a stable category', () => {
    expect(toAiOperationErrorCategory(new Error('Bearer secret-token failed'))).toBe('provider_error');
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/ai-operation.model.spec.ts
```

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement the pure model**

Use this public type and exhaustive switch:

```ts
export type AiOperationState =
  | 'RESERVED' | 'IN_FLIGHT' | 'SUCCEEDED' | 'FAILED'
  | 'CONFIRMED' | 'RELEASED' | 'REVIEW_REQUIRED';

export function recoveryActionForAiOperation(status: AiOperationState) {
  switch (status) {
    case 'RESERVED':
    case 'FAILED': return 'release' as const;
    case 'SUCCEEDED': return 'confirm' as const;
    case 'IN_FLIGHT':
    case 'REVIEW_REQUIRED': return 'review' as const;
    case 'CONFIRMED':
    case 'RELEASED': return 'skip' as const;
  }
}

export function toAiOperationErrorCategory(error: unknown): string {
  return error instanceof Error && error.name === 'AbortError' ? 'provider_timeout' : 'provider_error';
}
```

- [ ] **Step 4: Add the Prisma enum and model**

Add:

```prisma
enum AiOperationStatus {
  RESERVED
  IN_FLIGHT
  SUCCEEDED
  FAILED
  CONFIRMED
  RELEASED
  REVIEW_REQUIRED
}

model AiOperation {
  id            String            @id @default(uuid())
  tenantId      String            @map("tenant_id")
  userId        String            @map("user_id")
  providerId    String?           @map("provider_id")
  kind          String
  operationKey  String            @map("operation_key")
  reservationId String?           @unique @map("reservation_id")
  reservation   CreditReservation? @relation(fields: [reservationId], references: [id])
  status        AiOperationStatus @default(RESERVED)
  errorCategory String?           @map("error_category")
  createdAt     DateTime          @default(now()) @map("created_at")
  updatedAt     DateTime          @updatedAt @map("updated_at")

  @@unique([tenantId, operationKey])
  @@index([tenantId, status, createdAt])
  @@map("ai_operations")
}
```

Add `aiOperation AiOperation?` to `CreditReservation`. The SQL migration must create the enum, table, indexes, and a foreign key from `reservation_id` to `credit_reservations(id)`.

- [ ] **Step 5: Verify model and Prisma generation**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/ai-operation.model.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:generate
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/backend/src/modules/billing/ai-operation.model.ts packages/backend/src/modules/billing/ai-operation.model.spec.ts packages/backend/prisma
git commit -m "feat: add durable AI operation states"
```

### Task 2: Coordinate AI provider calls with reservation state

**Files:**
- Create: `packages/backend/src/modules/billing/ai-billing-coordinator.ts`
- Create: `packages/backend/src/modules/billing/ai-billing-coordinator.spec.ts`
- Modify: `packages/backend/src/modules/billing/billing.module.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`
- Modify: `packages/backend/src/modules/ai/ai.service.ts`
- Modify: `packages/backend/src/modules/ai/ai.service.spec.ts`
- Modify: `packages/backend/scripts/recover-stale-reservations.ts`

**Interfaces:**
- Produces: `AiBillingCoordinator.execute<T>(input, providerCall): Promise<T>`.
- Produces: `AiBillingCoordinator.reconcileStale(input): Promise<AiReconciliationResult>`.
- Consumes: existing `BillingService.reserve`, `confirmReservation`, and `releaseReservation`.

- [ ] **Step 1: Write coordinator tests for every failure window**

Create a real coordinator instance with mocked Prisma and BillingService dependencies. Tests must prove:

1. Success transitions `RESERVED → IN_FLIGHT → SUCCEEDED → CONFIRMED`.
2. Provider failure transitions through `FAILED`, releases credit, then writes `RELEASED`.
3. Confirmation failure leaves the operation `SUCCEEDED` and does not release credit.
4. Failure to persist `SUCCEEDED` leaves `IN_FLIGHT` and does not release credit.
5. Reconciliation releases `RESERVED`/`FAILED`, confirms `SUCCEEDED`, marks `IN_FLIGHT` as `REVIEW_REQUIRED`, and skips terminal states.

Use an input shaped as:

```ts
const input = {
  user,
  providerId: 'provider-1',
  kind: 'ai.chat',
  operationKey: 'op-key',
  amount: 1,
  ref: { refType: 'ai.chat', idempotencyKey: 'op-key' },
};
```

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/ai-billing-coordinator.spec.ts
```

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement `execute` with durable transitions**

Reserve first, then create the durable operation before starting the provider call:

```ts
const reservation = await billing.reserve(user, 'AI', amount, ref);
try {
  await prisma.aiOperation.create({
    data: { ...identity, reservationId: reservation.reservationId, status: 'RESERVED' },
  });
} catch (error) {
  await billing.releaseReservation(user, 'AI', amount, ref);
  throw error;
}
await prisma.aiOperation.update({
  where: { tenantId_operationKey: { tenantId: user.tenantId, operationKey } },
  data: { status: 'IN_FLIGHT' },
});
```

Then call the provider. On failure, write `FAILED`, release, and write `RELEASED`. On success, write `SUCCEEDED`, confirm, and write `CONFIRMED`. Catch blocks must not release after the provider returned successfully.

- [ ] **Step 4: Implement stale reconciliation**

Query non-terminal AI operations older than the supplied cutoff and apply `recoveryActionForAiOperation`. When action is `review`, update to `REVIEW_REQUIRED` without changing the credit account. Return counts for confirmed, released, review-required, skipped, and errors.

Modify generic stale release so an AI `refType` returns `false` instead of releasing. This ensures the coordinator is the only AI reconciliation path.

- [ ] **Step 5: Integrate with `AiService` and the recovery script**

Replace `callWithReservation` with coordinator calls. Pass provider ID and operation kind for chat, advice, ask, diagnose, and transcribe. Keep provider response/error mapping in `AiService`; the coordinator owns only lifecycle and billing.

Update the script to instantiate the coordinator and run AI reconciliation before generic trace/credit recovery. Its JSON output must include separate `ai` and `generic` results.

- [ ] **Step 6: Verify focused and regression suites**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/ai-billing-coordinator.spec.ts src/modules/billing/billing.service.spec.ts src/modules/ai/ai.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/backend/src/modules/billing packages/backend/src/modules/ai packages/backend/scripts/recover-stale-reservations.ts
git commit -m "fix: reconcile ambiguous AI credit operations"
```

### Task 3: Add tenant foreign keys and ownership constraint triggers

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260713100000_tenant_consistency_constraints/migration.sql`
- Modify: `packages/backend/prisma/audit-data-consistency.sql`
- Create: `packages/backend/test/tenant-constraints.e2e-spec.ts`

**Interfaces:**
- Produces: tenant relations for every Prisma model with `tenantId`.
- Produces named PostgreSQL constraints beginning `tenant_consistency_`.

- [ ] **Step 1: Write failing direct-SQL E2E cases**

Create E2E tests that use `PrismaService.$executeRawUnsafe` inside cleanup-safe transactions or create/delete fixture rows. Each test must expect rejection for:

- a batch whose `tenant_id` differs from its field;
- a batch whose `owner_id` differs from its field owner;
- a farm record whose field differs from its batch field;
- a supply issue whose owner differs from its supply/batch;
- a trace scan whose tenant differs from its batch;
- a credit reservation whose tenant differs from its account.

Assert the error text contains the relevant stable constraint name, for example `tenant_consistency_batch_field_owner`.

- [ ] **Step 2: Verify RED against the prepared database**

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/tenant-constraints.e2e-spec.ts
```

Expected: FAIL because inconsistent direct inserts are currently accepted.

- [ ] **Step 3: Declare tenant relations in Prisma**

Add reverse collections to `Tenant` and a required relation to each model carrying `tenantId`, using this pattern:

```prisma
tenant Tenant @relation(fields: [tenantId], references: [id])
```

Models include Field, Batch, FarmRecord, CropPhenology, TraceCode, TraceEvent, TraceScan, TraceCredential, Supply, SupplyIssue, AiProvider, OssConfig, IntegrationConfig, UserGroup, QuickTemplate, CreditAccount, CreditReservation, CreditPlan, CreditOrder, and AiOperation. Also add the missing `TraceScan.batch` relation, its `Batch.traceScans` reverse field, and a `trace_scans.batch_id → batches.id` foreign key so Stage C can use a relational scope filter.

- [ ] **Step 4: Expand the preflight audit**

Add union branches for trace tenant mismatches and credit reservation/account mismatch. The audit must continue returning zero rows for a clean database and columns `issue_type`, `record_id`, and `detail` for every problem.

- [ ] **Step 5: Implement migration preflight, foreign keys, and triggers**

The migration must first execute a PL/pgSQL block that raises when the same consistency queries return rows. Then add tenant foreign keys.

Create constraint trigger functions for each invariant. The batch function follows this exact shape:

```sql
CREATE FUNCTION enforce_batch_field_owner_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fields f
    WHERE f.id = NEW.field_id
      AND f.tenant_id = NEW.tenant_id
      AND f.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'tenant_consistency_batch_field_owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tenant_consistency_batch_field_owner
AFTER INSERT OR UPDATE OF tenant_id, owner_id, field_id ON batches
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION enforce_batch_field_owner_consistency();
```

Implement equivalent named functions/triggers for farm records, supply issues, farm-record supplies, trace records, and credit reservations.

- [ ] **Step 6: Deploy and verify constraints**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:generate
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
psql "$env:DATABASE_URL" -f packages/backend/prisma/audit-data-consistency.sql
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/tenant-constraints.e2e-spec.ts
```

Expected: migration PASS; audit returns zero rows; E2E PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/backend/prisma packages/backend/test/tenant-constraints.e2e-spec.ts
git commit -m "feat: enforce tenant consistency in PostgreSQL"
```

### Task 4: Add database-backed web session and AI recovery E2E

**Files:**
- Create: `packages/backend/test/web-session.e2e-spec.ts`
- Create: `packages/backend/test/ai-reconciliation.e2e-spec.ts`

**Interfaces:**
- Consumes: Stage A web session endpoints.
- Consumes: `AiBillingCoordinator.reconcileStale`.

- [ ] **Step 1: Write web cookie E2E cases**

Use Supertest's agent to retain cookies. Cover:

- web login returns `accessToken`, omits `refreshToken`, and sets `nc_refresh` with `HttpOnly` and `SameSite=Strict`;
- web refresh rotates the cookie and returns a new access token;
- web logout expires the cookie and subsequent refresh returns `401`;
- changing the password increments `sessionVersion`, making the old cookie refresh return `401`.

- [ ] **Step 2: Write AI reconciliation E2E cases**

Insert accounts, reservations, and AI operations for `RESERVED`, `SUCCEEDED`, and `IN_FLIGHT`. Run reconciliation and assert:

- `RESERVED` restores the balance and writes `RELEASED` ledger/state;
- `SUCCEEDED` keeps the reserved balance and writes `CONFIRMED` ledger/state;
- `IN_FLIGHT` keeps the reserved balance and becomes `REVIEW_REQUIRED`.

- [ ] **Step 3: Verify the new E2E files**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/web-session.e2e-spec.ts test/ai-reconciliation.e2e-spec.ts
```

Expected: PASS after Tasks 1–3.

- [ ] **Step 4: Commit**

```powershell
git add packages/backend/test/web-session.e2e-spec.ts packages/backend/test/ai-reconciliation.e2e-spec.ts
git commit -m "test: cover cookie sessions and AI reconciliation"
```

### Task 5: Run and document the complete PostGIS production gate

**Files:**
- Modify: `docs/ops/production-verification.md`
- Modify: `docs/deploy/baota.md`

**Interfaces:**
- Produces: an operator sequence that runs exactly the same gate as CI.

- [ ] **Step 1: Start and prepare PostGIS**

```powershell
docker compose -f docker-compose.dev.yml up -d
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
```

Expected: database becomes healthy; migrations and guarded seed exit `0`.

- [ ] **Step 2: Run audit and full production verification**

```powershell
psql "$env:DATABASE_URL" -f packages/backend/prisma/audit-data-consistency.sql
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 verify:production
```

Expected: audit returns zero rows; all builds, lint, unit tests, dependency audit, and all backend E2E pass.

- [ ] **Step 3: Update operational documentation**

Document AI reconciliation result meanings, `REVIEW_REQUIRED` handling, migration preflight failures, the constraint audit, and the exact full-gate command.

- [ ] **Step 4: Commit**

```powershell
git add docs/ops/production-verification.md docs/deploy/baota.md
git commit -m "docs: document reconciliation and database gates"
```
