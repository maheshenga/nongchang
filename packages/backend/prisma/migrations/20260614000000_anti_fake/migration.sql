ALTER TABLE "trace_codes" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "trace_scans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trace_scans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trace_scans_tenant_id_idx" ON "trace_scans"("tenant_id");
CREATE INDEX "trace_scans_code_scanned_at_idx" ON "trace_scans"("code", "scanned_at");
CREATE INDEX "trace_scans_batch_id_idx" ON "trace_scans"("batch_id");
