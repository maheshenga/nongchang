CREATE TABLE "tenant_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "public_coordinate_mode" TEXT NOT NULL DEFAULT 'hidden',
  "brand_name" TEXT NOT NULL DEFAULT '农场溯源管理',
  "industry_name" TEXT NOT NULL DEFAULT '农业',
  "default_crop_name" TEXT NOT NULL DEFAULT '作物',
  "workbench_title" TEXT NOT NULL DEFAULT '农业工作台',
  "default_base_label" TEXT NOT NULL DEFAULT '当前基地',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_settings_tenant_id_key"
  ON "tenant_settings"("tenant_id");

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
