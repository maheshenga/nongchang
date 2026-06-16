-- 把 users.role 由裸 TEXT 升为 PG 枚举 Role,在数据库层挡住非法角色写入。
-- 现有取值(system_admin/agent_admin/merchant)与枚举标签一致,USING 强转无损。

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('system_admin', 'agent_admin', 'merchant');

-- AlterTable: TEXT -> Role(逐行 USING 强转)
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role" USING ("role"::"Role");
