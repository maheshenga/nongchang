CREATE TYPE "AiOperationStatus" AS ENUM (
  'RESERVED',
  'IN_FLIGHT',
  'SUCCEEDED',
  'FAILED',
  'CONFIRMED',
  'RELEASED',
  'REVIEW_REQUIRED'
);

CREATE TABLE "ai_operations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider_id" TEXT,
  "kind" TEXT NOT NULL,
  "operation_key" TEXT NOT NULL,
  "reservation_id" TEXT,
  "status" "AiOperationStatus" NOT NULL DEFAULT 'RESERVED',
  "error_category" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_operations_reservation_id_fkey"
    FOREIGN KEY ("reservation_id") REFERENCES "credit_reservations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ai_operations_reservation_id_key"
  ON "ai_operations"("reservation_id");
CREATE UNIQUE INDEX "ai_operations_tenant_id_operation_key_key"
  ON "ai_operations"("tenant_id", "operation_key");
CREATE INDEX "ai_operations_tenant_id_status_created_at_idx"
  ON "ai_operations"("tenant_id", "status", "created_at");
