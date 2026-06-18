-- 自助购买额度:售卖套餐 + 购买订单。支付环节当前为占位(标记已支付即入账)。

-- LedgerReason 增加 PURCHASE(购买入账,区别于平台 RECHARGE / 上级 ALLOCATE_IN)
ALTER TYPE "LedgerReason" ADD VALUE 'PURCHASE';

-- 订单状态枚举
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- 售卖套餐
CREATE TABLE "credit_plans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource" "CreditResource" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "is_unit" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_plans_pkey" PRIMARY KEY ("id")
);

-- 购买订单
CREATE TABLE "credit_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_type" "CreditOwnerType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "resource" "CreditResource" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "buyer_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_plans_tenant_id_idx" ON "credit_plans"("tenant_id");
CREATE INDEX "credit_orders_tenant_id_owner_type_owner_id_idx" ON "credit_orders"("tenant_id", "owner_type", "owner_id");
CREATE INDEX "credit_orders_tenant_id_status_idx" ON "credit_orders"("tenant_id", "status");

-- 订单引用套餐:套餐删除受限(Restrict),已有订单的套餐不可删
ALTER TABLE "credit_orders" ADD CONSTRAINT "credit_orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "credit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
