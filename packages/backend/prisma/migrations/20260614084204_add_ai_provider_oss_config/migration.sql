-- DropIndex
DROP INDEX "fields_location_gist";

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key_enc" TEXT NOT NULL,
    "text_model" TEXT NOT NULL,
    "vision_model" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oss_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "access_key_id" TEXT NOT NULL,
    "access_key_sec_enc" TEXT NOT NULL,
    "base_url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oss_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_providers_tenant_id_idx" ON "ai_providers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "oss_configs_tenant_id_key" ON "oss_configs"("tenant_id");
