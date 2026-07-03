-- app_id is reused by several integration providers. Only WeChat login needs
-- global app_id uniqueness because anonymous login resolves tenant by app_id.
DROP INDEX IF EXISTS "integration_configs_app_id_key";

CREATE INDEX IF NOT EXISTS "integration_configs_provider_app_id_idx"
  ON "integration_configs"("provider", "app_id");

CREATE UNIQUE INDEX "integration_configs_wechat_app_id_key"
  ON "integration_configs"("app_id")
  WHERE "provider" = 'wechat' AND "app_id" IS NOT NULL;
