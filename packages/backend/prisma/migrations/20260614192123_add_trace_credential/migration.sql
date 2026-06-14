-- CreateTable
CREATE TABLE "trace_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "serial_no" TEXT,
    "issued_at" TIMESTAMP(3),
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trace_credentials_tenant_id_idx" ON "trace_credentials"("tenant_id");

-- CreateIndex
CREATE INDEX "trace_credentials_batch_id_idx" ON "trace_credentials"("batch_id");
