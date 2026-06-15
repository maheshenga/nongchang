-- AlterTable
ALTER TABLE "farm_records" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'completed';

-- CreateTable
CREATE TABLE "crop_phenologies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "crop_name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "expected_days" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_phenologies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crop_phenologies_tenant_id_idx" ON "crop_phenologies"("tenant_id");

-- CreateIndex
CREATE INDEX "crop_phenologies_tenant_id_crop_name_idx" ON "crop_phenologies"("tenant_id", "crop_name");
