ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'RELEASED';

DO $$ BEGIN
  CREATE TYPE "CreditReservationStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "credit_reservations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "resource" "CreditResource" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "status" "CreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "ref_type" TEXT,
  "ref_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "operator_id" TEXT,
  "note" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_reservations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "credit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_reservations_account_id_resource_idempotency_key_key"
  ON "credit_reservations"("account_id", "resource", "idempotency_key");
CREATE INDEX IF NOT EXISTS "credit_reservations_tenant_id_status_created_at_idx"
  ON "credit_reservations"("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "credit_reservations_ref_type_ref_id_idx"
  ON "credit_reservations"("ref_type", "ref_id");

ALTER TABLE "trace_codes" ADD COLUMN IF NOT EXISTS "reservation_id" TEXT;
ALTER TABLE "trace_codes" ADD COLUMN IF NOT EXISTS "generation_key" TEXT;
CREATE INDEX IF NOT EXISTS "trace_codes_tenant_id_batch_id_generation_key_idx"
  ON "trace_codes"("tenant_id", "batch_id", "generation_key");

DO $$ BEGIN
  ALTER TABLE "trace_codes"
    ADD CONSTRAINT "trace_codes_reservation_id_fkey"
    FOREIGN KEY ("reservation_id") REFERENCES "credit_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
