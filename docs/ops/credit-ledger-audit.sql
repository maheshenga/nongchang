-- Find credit consumption rows that have no matching refund.
-- Read-only audit for P4-A; run manually against production snapshots.

SELECT
  consume.id AS consume_ledger_id,
  consume.account_id,
  consume.resource,
  consume.delta AS consume_delta,
  consume.balance_after,
  consume.ref_type,
  consume.ref_id,
  consume.idempotency_key,
  consume.created_at
FROM credit_ledgers consume
WHERE consume.reason = 'CONSUME'
  AND NOT EXISTS (
    SELECT 1
    FROM credit_ledgers refund
    WHERE refund.account_id = consume.account_id
      AND refund.reason = 'REFUND'
      AND refund.resource = consume.resource
      AND refund.delta = -consume.delta
      AND refund.ref_type IS NOT DISTINCT FROM consume.ref_type
      AND refund.ref_id IS NOT DISTINCT FROM consume.ref_id
      AND refund.idempotency_key IS NOT DISTINCT FROM consume.idempotency_key
      AND refund.created_at >= consume.created_at
  )
ORDER BY consume.created_at DESC;

-- Find stale RESERVED reservations that may need operator recovery.
-- Adjust the interval to match the operational SLA for provider calls.

SELECT
  r.id AS reservation_id,
  r.tenant_id,
  r.account_id,
  a.owner_type,
  a.owner_id,
  r.resource,
  r.amount,
  r.balance_after,
  r.ref_type,
  r.ref_id,
  r.idempotency_key,
  r.operator_id,
  r.created_at,
  now() - r.created_at AS reserved_for
FROM credit_reservations r
JOIN credit_accounts a ON a.id = r.account_id
WHERE r.status = 'RESERVED'
  AND r.created_at < now() - interval '60 minutes'
ORDER BY r.created_at ASC;

-- Dangerous dirty state: a reservation is still RESERVED but already has a terminal ledger.
-- Recovery must not add balance again for these rows; inspect manually.

SELECT
  r.id AS reservation_id,
  r.status,
  r.account_id,
  r.resource,
  r.amount,
  r.ref_type,
  r.ref_id,
  r.idempotency_key,
  l.id AS ledger_id,
  l.reason AS ledger_reason,
  l.delta AS ledger_delta,
  l.created_at AS ledger_created_at
FROM credit_reservations r
JOIN credit_ledgers l
  ON l.account_id = r.account_id
 AND l.idempotency_key = r.idempotency_key
 AND l.reason IN ('CONFIRMED', 'RELEASED')
WHERE r.status = 'RESERVED'
ORDER BY r.created_at ASC;

-- Find terminal reservations with no matching terminal ledger.

SELECT
  r.id AS reservation_id,
  r.status,
  r.account_id,
  r.resource,
  r.amount,
  r.ref_type,
  r.ref_id,
  r.idempotency_key,
  r.created_at,
  r.updated_at
FROM credit_reservations r
WHERE r.status IN ('CONFIRMED', 'RELEASED')
  AND NOT EXISTS (
    SELECT 1
    FROM credit_ledgers l
    WHERE l.account_id = r.account_id
      AND l.resource = r.resource
      AND l.reason = r.status::text::"LedgerReason"
      AND l.idempotency_key = r.idempotency_key
  )
ORDER BY r.updated_at DESC;

-- Find terminal reservation ledgers with wrong delta or mismatched reference metadata.
-- CONFIRMED should be zero-delta. RELEASED should add back exactly reservation.amount.

SELECT
  r.id AS reservation_id,
  r.status,
  r.account_id,
  r.resource AS reservation_resource,
  r.amount AS reservation_amount,
  r.ref_type AS reservation_ref_type,
  r.ref_id AS reservation_ref_id,
  r.idempotency_key,
  l.id AS ledger_id,
  l.resource AS ledger_resource,
  l.delta AS ledger_delta,
  l.ref_type AS ledger_ref_type,
  l.ref_id AS ledger_ref_id
FROM credit_reservations r
JOIN credit_ledgers l
  ON l.account_id = r.account_id
 AND l.idempotency_key = r.idempotency_key
 AND l.reason = r.status::text::"LedgerReason"
WHERE r.status IN ('CONFIRMED', 'RELEASED')
  AND (
    l.resource <> r.resource
    OR l.ref_type IS DISTINCT FROM r.ref_type
    OR l.ref_id IS DISTINCT FROM r.ref_id
    OR (r.status = 'CONFIRMED' AND l.delta <> 0)
    OR (r.status = 'RELEASED' AND l.delta <> r.amount)
  )
ORDER BY r.updated_at DESC;
