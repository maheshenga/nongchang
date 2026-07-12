CREATE TYPE "UploadAssetStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'DELETED');

CREATE TABLE "upload_quota_usage" (
  "tenant_id" TEXT NOT NULL,
  "day_key" TEXT NOT NULL,
  "daily_bytes" BIGINT NOT NULL DEFAULT 0,
  "active_bytes" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "upload_quota_usage_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "upload_quota_usage_non_negative" CHECK ("daily_bytes" >= 0 AND "active_bytes" >= 0),
  CONSTRAINT "upload_quota_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "upload_assets" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "url" TEXT,
  "size_bytes" BIGINT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "UploadAssetStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "upload_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "upload_assets_positive_size" CHECK ("size_bytes" > 0),
  CONSTRAINT "upload_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "upload_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "upload_assets_object_key_key" ON "upload_assets"("object_key");
CREATE INDEX "upload_assets_tenant_id_status_created_at_idx" ON "upload_assets"("tenant_id", "status", "created_at");
CREATE INDEX "upload_assets_user_id_created_at_idx" ON "upload_assets"("user_id", "created_at");
