-- BUG 修复:计费账户唯一性改为租户内唯一。
-- 原 @@unique([ownerType, ownerId]) + PLATFORM 固定 ownerId='PLATFORM' 导致全库仅一行平台账户,
-- 所有租户共用同一额度池(跨租户串账)。改为 (tenantId, ownerType, ownerId) 复合唯一。
DROP INDEX "credit_accounts_owner_type_owner_id_key";
CREATE UNIQUE INDEX "credit_accounts_tenant_id_owner_type_owner_id_key"
  ON "credit_accounts"("tenant_id", "owner_type", "owner_id");
