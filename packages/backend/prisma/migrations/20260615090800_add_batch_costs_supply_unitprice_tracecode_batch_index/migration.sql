-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "labor_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sell_price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "supply_issues" ADD COLUMN     "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "trace_codes_batch_id_idx" ON "trace_codes"("batch_id");
