-- username 由全局唯一改为租户内唯一,密码登录改用 (tenantCode + username) 定位用户。
-- 新增 tenants.code(机构编码,全局唯一)作为登录时定位租户的稳定锚点。

-- 1) 先以可空列加入 code,回填既有租户(演示租户固定 'DEMO',其余按短 id 兜底),
--    再置 NOT NULL —— 避免对存量行直接加 NOT NULL 列而失败。
ALTER TABLE "tenants" ADD COLUMN "code" TEXT;
-- 演示租户(含 sysadmin 用户的那一行)固定 'DEMO';历史上可能存在多行同名 'Demo Tenant',
-- 仅认带 sysadmin 的一行为规范演示租户,其余按短 id 兜底,避免唯一索引冲突。
UPDATE "tenants" SET "code" = 'DEMO'
  WHERE "id" = (SELECT "tenant_id" FROM "users" WHERE "username" = 'sysadmin' LIMIT 1);
UPDATE "tenants" SET "code" = 'T-' || substr("id", 1, 8) WHERE "code" IS NULL;
ALTER TABLE "tenants" ALTER COLUMN "code" SET NOT NULL;

-- 2) tenants.code 全局唯一
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- 3) users.username 去全局唯一,改租户内唯一
DROP INDEX "users_username_key";
CREATE UNIQUE INDEX "users_tenant_id_username_key" ON "users"("tenant_id", "username");
