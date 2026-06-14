-- AlterTable
ALTER TABLE "users" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "app_id" TEXT,
    "secret_enc" TEXT,
    "api_key_enc" TEXT,
    "api_secret_enc" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_configs_tenant_id_idx" ON "integration_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_tenant_id_provider_key" ON "integration_configs"("tenant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_app_id_key" ON "integration_configs"("app_id");

-- CreateIndex
CREATE INDEX "user_groups_tenant_id_idx" ON "user_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_groups_tenant_id_name_key" ON "user_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "users_group_id_idx" ON "users"("group_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
