import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FarmRecordService } from './farm-record.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, FarmRecordSource, type AuthUser } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const BATCH = '11111111-1111-1111-1111-111111111111';
const FIELD = '22222222-2222-2222-2222-222222222222';
const base = { batchId: BATCH, fieldId: FIELD, action: '施肥', recordedAt: '2026-06-14T10:00:00.000Z', source: FarmRecordSource.MINIAPP };

function makeService(overrides: any = {}) {
  let created: any;
  const prisma = {
    farmRecord: {
      create: async (a: any) => { created = a; return { id: 'fr1', ...a.data }; },
      aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
    },
    supplyIssue: { aggregate: async () => ({ _sum: { amount: overrides.quota ?? 0 } }) },
  };
  return { svc: new FarmRecordService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('FarmRecordService.create 核销', () => {
  it('无 supplyId:走原路径,不校验配额', async () => {
    const h = makeService();
    const r = await h.svc.create(merchant, { ...base });
    expect(r.id).toBe('fr1');
    expect(h.created.data.supplyId).toBeUndefined();
  });
  it('带 supplyId 且未超配额110%:落两列', async () => {
    const h = makeService({ quota: 100, consumed: 0 });
    await h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 });
    expect(h.created.data.supplyId).toBe('sup1');
    expect(h.created.data.supplyAmount).toBe(50);
  });
  it('恰好等于配额110%:通过', async () => {
    const h = makeService({ quota: 100, consumed: 60 });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 })).resolves.toBeDefined();
  });
  it('超过配额110%:抛 BadRequest', async () => {
    const h = makeService({ quota: 100, consumed: 65 });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
