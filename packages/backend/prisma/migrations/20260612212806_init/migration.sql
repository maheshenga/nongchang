-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agent_id" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT,
    "wx_openid" TEXT,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fields" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" DOUBLE PRECISION NOT NULL,
    "iot_device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "crop_name" TEXT NOT NULL,
    "plant_date" TIMESTAMP(3) NOT NULL,
    "expected_harvest" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "images" JSONB,
    "location" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_codes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scan_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agents_tenant_id_idx" ON "agents"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_wx_openid_key" ON "users"("wx_openid");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_agent_id_idx" ON "users"("agent_id");

-- CreateIndex
CREATE INDEX "fields_tenant_id_idx" ON "fields"("tenant_id");

-- CreateIndex
CREATE INDEX "fields_owner_id_idx" ON "fields"("owner_id");

-- CreateIndex
CREATE INDEX "batches_tenant_id_idx" ON "batches"("tenant_id");

-- CreateIndex
CREATE INDEX "batches_owner_id_idx" ON "batches"("owner_id");

-- CreateIndex
CREATE INDEX "farm_records_tenant_id_idx" ON "farm_records"("tenant_id");

-- CreateIndex
CREATE INDEX "farm_records_batch_id_idx" ON "farm_records"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "trace_codes_code_key" ON "trace_codes"("code");

-- CreateIndex
CREATE INDEX "trace_codes_tenant_id_idx" ON "trace_codes"("tenant_id");

-- CreateIndex
CREATE INDEX "trace_events_tenant_id_idx" ON "trace_events"("tenant_id");

-- CreateIndex
CREATE INDEX "trace_events_batch_id_idx" ON "trace_events"("batch_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
