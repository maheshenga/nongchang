-- AlterTable
ALTER TABLE "farm_records" ADD COLUMN "supply_id" TEXT;
ALTER TABLE "farm_records" ADD COLUMN "supply_amount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "supplies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_issues" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "supply_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplies_tenant_id_idx" ON "supplies"("tenant_id");
CREATE INDEX "supplies_owner_id_idx" ON "supplies"("owner_id");
CREATE INDEX "supply_issues_tenant_id_idx" ON "supply_issues"("tenant_id");
CREATE INDEX "supply_issues_owner_id_idx" ON "supply_issues"("owner_id");
CREATE INDEX "supply_issues_supply_id_idx" ON "supply_issues"("supply_id");
CREATE INDEX "supply_issues_batch_id_supply_id_idx" ON "supply_issues"("batch_id", "supply_id");
