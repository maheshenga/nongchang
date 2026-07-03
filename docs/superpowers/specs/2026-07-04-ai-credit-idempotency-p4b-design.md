# AI Credit Idempotency P4-B Design

## Goal

Prevent repeated AI requests from consuming credits more than once when the retry carries the same business payload.

## Scope

This is the small Phase 4-B slice. It reuses the P4-A `BillingService.consume(..., idempotencyKey)` support and does not add a reservation workflow, async job table, or request replay cache.

## Design

`AiService` will attach a stable idempotency key to every credit-consuming AI call:

- `ai.chat:{tenantId}:{userId}:{hash(message)}`
- `ai.advice:{tenantId}:{userId}:{batchId}`
- `ai.ask:{tenantId}:{userId}:{hash(question)}`
- `ai.diagnose:{tenantId}:{userId}:{hash(image + note)}`
- `ai.transcribe:{tenantId}:{userId}:{hash(audio)}`

The hash uses Node's built-in SHA-256 and a short hex prefix. No new dependency is needed.

The existing "consume before external call, refund on external failure" behavior stays unchanged. P4-B only makes the consume ledger idempotent so an accidental duplicate submit of the same AI payload does not decrement the account twice.

## Acceptance

- `chat`, `advice`, `ask`, `diagnose`, and `transcribe` pass idempotency keys to billing.
- Repeating the same AI payload for the same tenant and user produces the same key.
- Existing refund behavior still receives the same reference object used for consume.
- Backend AI and billing tests continue to pass.
