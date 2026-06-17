-- #115:每租户至多一条 enabled=true 的 AI 服务商。
-- 应用层已用事务(先 updateMany 全置 false 再置一个 true)收敛,但两个并发事务各自提交仍可能
-- 留下两行 enabled=true。偏唯一索引在 DB 层根治:仅对 enabled=true 的行约束 tenant_id 唯一,
-- enabled=false 的行不受约束(可任意多条)。
CREATE UNIQUE INDEX "ai_providers_tenant_id_enabled_key"
  ON "ai_providers"("tenant_id")
  WHERE "enabled" = true;
