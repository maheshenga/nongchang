import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';

describe('tenant consistency database constraints', () => {
  const prisma = new PrismaService();
  const supplyId = `constraint-supply-${randomUUID()}`;
  let tenantId: string;
  let otherTenantId: string;
  let batchId: string;
  let batchOwnerId: string;
  let otherOwnerId: string;
  let batchFieldId: string;
  let otherFieldId: string;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    const otherTenant = await prisma.tenant.findFirstOrThrow({ where: { id: { not: tenant.id } } });
    const batch = await prisma.batch.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const otherField = await prisma.field.findFirstOrThrow({
      where: { tenantId: tenant.id, id: { not: batch.fieldId }, ownerId: { not: batch.ownerId } },
    });
    const account = await prisma.creditAccount.findFirstOrThrow({
      where: { tenantId: tenant.id, ownerId: batch.ownerId },
    });

    tenantId = tenant.id;
    otherTenantId = otherTenant.id;
    batchId = batch.id;
    batchOwnerId = batch.ownerId;
    otherOwnerId = otherField.ownerId;
    batchFieldId = batch.fieldId;
    otherFieldId = otherField.id;
    accountId = account.id;

    await prisma.supply.create({
      data: {
        id: supplyId,
        tenantId,
        ownerId: batchOwnerId,
        name: 'Constraint fixture supply',
        unit: 'kg',
        total: 10,
        used: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.supplyIssue.deleteMany({ where: { supplyId } });
    await prisma.supply.deleteMany({ where: { id: supplyId } });
    await prisma.$disconnect();
  });

  it('rejects a batch whose tenant differs from its field', async () => {
    const id = `constraint-batch-tenant-${randomUUID()}`;
    try {
      await expect(prisma.$executeRawUnsafe(`
        INSERT INTO batches (
          id, tenant_id, owner_id, field_id, batch_no, crop_name,
          plant_date, expected_harvest, status, labor_cost, sell_price, created_at
        ) VALUES (
          '${id}', '${otherTenantId}', '${batchOwnerId}', '${batchFieldId}', 'BAD-TENANT', 'test',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Growing', 0, 0, CURRENT_TIMESTAMP
        )
      `)).rejects.toThrow('tenant_consistency_batch_field_owner');
    } finally {
      await prisma.batch.deleteMany({ where: { id } });
    }
  });

  it('rejects a batch whose owner differs from its field owner', async () => {
    const id = `constraint-batch-owner-${randomUUID()}`;
    try {
      await expect(prisma.$executeRawUnsafe(`
        INSERT INTO batches (
          id, tenant_id, owner_id, field_id, batch_no, crop_name,
          plant_date, expected_harvest, status, labor_cost, sell_price, created_at
        ) VALUES (
          '${id}', '${tenantId}', '${otherOwnerId}', '${batchFieldId}', 'BAD-OWNER', 'test',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Growing', 0, 0, CURRENT_TIMESTAMP
        )
      `)).rejects.toThrow('tenant_consistency_batch_field_owner');
    } finally {
      await prisma.batch.deleteMany({ where: { id } });
    }
  });

  it('rejects a farm record whose field differs from its batch field', async () => {
    const id = `constraint-record-${randomUUID()}`;
    try {
      await expect(prisma.$executeRawUnsafe(`
        INSERT INTO farm_records (
          id, tenant_id, batch_id, field_id, operator_id, action,
          recorded_at, source, status, created_at
        ) VALUES (
          '${id}', '${tenantId}', '${batchId}', '${otherFieldId}', '${batchOwnerId}', 'test',
          CURRENT_TIMESTAMP, 'manual', 'completed', CURRENT_TIMESTAMP
        )
      `)).rejects.toThrow('tenant_consistency_farm_record_batch_field');
    } finally {
      await prisma.farmRecord.deleteMany({ where: { id } });
    }
  });

  it('rejects a supply issue whose owner differs from its supply and batch', async () => {
    const id = `constraint-issue-${randomUUID()}`;
    try {
      await expect(prisma.$executeRawUnsafe(`
        INSERT INTO supply_issues (
          id, tenant_id, owner_id, supply_id, batch_id, amount, unit_price, created_at
        ) VALUES (
          '${id}', '${tenantId}', '${otherOwnerId}', '${supplyId}', '${batchId}', 1, 0, CURRENT_TIMESTAMP
        )
      `)).rejects.toThrow('tenant_consistency_supply_issue_owner');
    } finally {
      await prisma.supplyIssue.deleteMany({ where: { id } });
    }
  });

  it('rejects a trace scan whose tenant differs from its batch', async () => {
    const id = `constraint-scan-${randomUUID()}`;
    try {
      await expect(prisma.$executeRawUnsafe(`
        INSERT INTO trace_scans (
          id, tenant_id, code, batch_id, ip, scanned_at
        ) VALUES (
          '${id}', '${otherTenantId}', 'BAD-SCAN', '${batchId}', '127.0.0.1', CURRENT_TIMESTAMP
        )
      `)).rejects.toThrow('tenant_consistency_trace_scan_batch');
    } finally {
      await prisma.traceScan.deleteMany({ where: { id } });
    }
  });

  it('rejects a credit reservation whose tenant differs from its account', async () => {
    const id = `constraint-reservation-${randomUUID()}`;
    try {
      await expect(prisma.$executeRawUnsafe(`
        INSERT INTO credit_reservations (
          id, tenant_id, account_id, resource, amount, balance_after, status,
          idempotency_key, created_at, updated_at
        ) VALUES (
          '${id}', '${otherTenantId}', '${accountId}', 'AI', 1, 0, 'RESERVED',
          '${id}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `)).rejects.toThrow('tenant_consistency_credit_reservation_account');
    } finally {
      await prisma.creditReservation.deleteMany({ where: { id } });
    }
  });
});
