import { PayloadTooLargeException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { AccountDataService } from './account-data.service';

const actor: AuthUser = {
  userId: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'u1',
};
const createdAt = new Date('2026-07-14T09:00:00.000Z');

function repository(row: unknown[] = [], count = 0) {
  return {
    count: vi.fn().mockResolvedValue(count),
    findMany: vi.fn().mockResolvedValue(row),
  };
}

function makeService() {
  const prisma = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ id: 't1', code: 'DEMO', name: '示例租户' }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'u1', tenantId: 't1', username: 'merchantA', role: Role.MERCHANT,
        agentId: null, displayName: '示例基地', phone: null, status: 'active',
        wxOpenid: 'openid-secret', passwordHash: 'hash-secret', sessionVersion: 7,
      }),
    },
    field: repository([{ id: 'field-1', name: '一号田', area: 1.5, createdAt }], 1),
    batch: repository([{ id: 'batch-1', batchNo: 'B001', cropName: '番茄', status: 'active', plantDate: createdAt, expectedHarvest: createdAt, createdAt }], 1),
    farmRecord: repository([{ id: 'record-1', batchId: 'batch-1', fieldId: 'field-1', action: '浇水', detail: null, images: [], location: null, recordedAt: createdAt, source: 'manual', status: 'completed', createdAt }], 1),
    supply: repository([{ id: 'supply-1', name: '有机肥', unit: 'kg', total: '10', used: '2', createdAt }], 1),
    supplyIssue: repository([{ id: 'issue-1', supplyId: 'supply-1', batchId: 'batch-1', amount: '1', unitPrice: '3', createdAt }], 1),
    uploadAsset: repository([{ id: 'upload-1', purpose: 'farm-record', url: null, sizeBytes: 123n, status: 'ACTIVE', createdAt, objectKey: 'object-secret', checksum: 'checksum-secret' }], 1),
    aiOperation: repository([{ id: 'ai-1', kind: 'diagnose', status: 'SUCCEEDED', errorCategory: null, createdAt, updatedAt: createdAt, providerId: 'provider-secret', resultEnvelope: { hidden: true } }], 1),
    creditOrder: repository([{ id: 'order-1', resource: 'AI', quantity: 1, amountCents: 100, status: 'PAID', payChannel: 'manual', paidAt: createdAt, createdAt, tradeNo: 'trade-secret' }], 1),
    creditAccount: {
      findUnique: vi.fn().mockResolvedValue({ id: 'account-1', aiBalance: 10, codeBalance: 20 }),
    },
    creditLedger: repository([{ id: 'ledger-1', resource: 'AI', delta: 10, balanceAfter: 10, reason: 'PURCHASE', note: null, createdAt, idempotencyKey: 'idempotency-secret' }], 1),
  };
  const legal = { getPrivacyContact: vi.fn().mockResolvedValue('隐私负责人，0571-12345678') };
  return { prisma, legal, service: new AccountDataService(prisma as never, legal as never) };
}

describe('AccountDataService', () => {
  it('previews only tenant and current-user scoped rows with latest-20 limits', async () => {
    const { prisma, service } = makeService();

    const result = await service.preview(actor);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', tenantId: 't1' },
    }));
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 't1' },
    }));
    expect(prisma.field.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', ownerId: 'u1' },
    });
    expect(prisma.batch.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', ownerId: 'u1' },
    });
    expect(prisma.farmRecord.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', operatorId: 'u1' },
    });
    expect(prisma.supply.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', ownerId: 'u1' },
    });
    expect(prisma.supplyIssue.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', ownerId: 'u1' },
    });
    expect(prisma.uploadAsset.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', userId: 'u1' },
    });
    expect(prisma.aiOperation.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', userId: 'u1' },
    });
    expect(prisma.creditOrder.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', buyerId: 'u1' },
    });
    expect(prisma.creditLedger.count).toHaveBeenCalledWith({ where: { accountId: 'account-1' } });
    expect(prisma.field.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', ownerId: 'u1' }, take: 20,
    }));
    expect(prisma.batch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', ownerId: 'u1' }, take: 20,
    }));
    expect(prisma.farmRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', operatorId: 'u1' }, take: 20,
    }));
    expect(prisma.supply.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', ownerId: 'u1' }, take: 20,
    }));
    expect(prisma.supplyIssue.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', ownerId: 'u1' }, take: 20,
    }));
    expect(prisma.uploadAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', userId: 'u1' }, take: 20,
    }));
    expect(prisma.aiOperation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', userId: 'u1' }, take: 20,
    }));
    expect(prisma.creditOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', buyerId: 'u1' }, take: 20,
    }));
    expect(prisma.creditAccount.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId_ownerType_ownerId: { tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'u1' },
      },
    }));
    expect(prisma.creditLedger.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId: 'account-1' }, take: 20,
    }));
    expect(result.recentLimit).toBe(20);
    expect(result.counts).toMatchObject({ fields: 1, creditLedgers: 1 });
    const serialized = JSON.stringify(result);
    for (const secret of [
      'passwordHash', 'wxOpenid', 'sessionVersion', 'objectKey', 'checksum', 'providerId',
      'resultEnvelope', 'tradeNo', 'idempotencyKey', 'hash-secret', 'openid-secret',
    ]) expect(serialized).not.toContain(secret);
  });

  it('rejects a category above 10,000 rows before fetching export collections', async () => {
    const { prisma, legal, service } = makeService();
    prisma.field.count.mockResolvedValue(10_001);

    await expect(service.export(actor)).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(service.export(actor)).rejects.toThrow(/地块.*隐私负责人/);
    expect(prisma.field.findMany).not.toHaveBeenCalled();
    expect(legal.getPrivacyContact).toHaveBeenCalledWith('t1');
  });

  it('rejects a serialized JSON body above 10 MiB', async () => {
    const { prisma, service } = makeService();
    prisma.field.findMany.mockResolvedValue([{ id: 'field-large', name: 'x'.repeat(10 * 1024 * 1024), area: 1, createdAt }]);

    await expect(service.export(actor)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('uses the administrator fallback without duplicating the contact instruction', async () => {
    const { prisma, legal, service } = makeService();
    prisma.field.count.mockResolvedValue(10_001);
    legal.getPrivacyContact.mockResolvedValue('请联系机构管理员');

    await expect(service.export(actor)).rejects.toThrow(
      '地块数据超过单次导出限制，请联系机构管理员协助处理。',
    );
  });

  it('returns a bounded UTF-8 JSON attachment with documented exclusions', async () => {
    const { service } = makeService();
    const file = await service.export(actor);
    const payload = JSON.parse(file.body.toString('utf8'));

    expect(file.fileName).toMatch(/^nongchang-account-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.exclusions).toContain(
      '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
    );
  });

  it('returns an escaped UTF-8 BOM CSV attachment without changing export scope', async () => {
    const { prisma, service } = makeService();
    prisma.field.findMany.mockResolvedValue([{
      id: 'field-1', name: '一号田,北区\n温室 "A"', area: 1.5, createdAt,
    }]);

    const file = await service.export(actor, 'csv');
    const csv = file.body.toString('utf8');

    expect(file.fileName).toMatch(/^nongchang-account-data-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('类别,名称,状态,发生时间,详情');
    expect(csv).toContain('"一号田,北区\n温室 ""A"""');
    expect(prisma.field.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', ownerId: 'u1' },
    }));
  });
});
