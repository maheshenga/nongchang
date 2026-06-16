-- CreateEnum
CREATE TYPE "CreditOwnerType" AS ENUM ('PLATFORM', 'AGENT', 'MERCHANT');

-- CreateEnum
CREATE TYPE "CreditResource" AS ENUM ('AI', 'CODE');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('RECHARGE', 'ALLOCATE_IN', 'ALLOCATE_OUT', 'CONSUME', 'REFUND');

-- CreateTable
CREATE TABLE "credit_accounts" (
    "id" TEXT NOT NULL,
    "owner_type" "CreditOwnerType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ai_balance" INTEGER NOT NULL DEFAULT 0,
    "code_balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledgers" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "resource" "CreditResource" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "operator_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_accounts_tenant_id_idx" ON "credit_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_accounts_owner_type_owner_id_key" ON "credit_accounts"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "credit_ledgers_account_id_created_at_idx" ON "credit_ledgers"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "credit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
