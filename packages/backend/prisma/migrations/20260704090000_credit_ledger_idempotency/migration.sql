ALTER TABLE "credit_ledgers"
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "credit_ledgers_account_id_reason_idempotency_key_key"
  ON "credit_ledgers"("account_id", "reason", "idempotency_key");
