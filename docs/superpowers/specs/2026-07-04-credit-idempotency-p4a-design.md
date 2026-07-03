# Credit Idempotency P4-A Design

## Goal

Prevent repeated credit-consuming business requests from writing duplicate credit consumption ledger rows, starting with trace-code generation.

## Scope

This is the small Phase 4-A slice. It does not implement the full `RESERVED` / `CONFIRMED` / `RELEASED` reservation state machine.

## Design

Add nullable `idempotencyKey` to `credit_ledgers` with a unique index scoped by account, reason, and key. Existing rows keep `NULL`, so old ledger data is unaffected.

`BillingService.consume` accepts an optional idempotency key. If a matching `CONSUME` ledger already exists for the account, it returns the previous balance and does not decrement again. If no matching row exists, it uses the existing atomic balance decrement and writes the ledger with the key.

`TraceService.generateCodes` derives a stable key from tenant, user, batch, and count. This protects accidental duplicate submits of the same generation request. The code-generation operation remains otherwise unchanged.

## Audit

Add a SQL note for finding `CONSUME` rows that do not have a matching `REFUND` row by account, resource, ref type, ref id, amount, and idempotency key. This is audit-only in P4-A.

## Acceptance

- Repeating the same trace-code generation call does not call billing consume twice.
- Existing non-idempotent consume and refund behavior remains compatible.
- Ledger API continues to return existing billing views.
