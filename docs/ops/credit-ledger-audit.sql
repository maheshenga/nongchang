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
