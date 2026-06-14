-- CreateTable
CREATE TABLE "quick_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "cost" DOUBLE PRECISION,
    "labor" DOUBLE PRECISION,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_templates_tenant_id_idx" ON "quick_templates"("tenant_id");
