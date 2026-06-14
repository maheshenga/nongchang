import { describe, it, expect, vi } from 'vitest';
import { BatchService } from './batch.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, BatchStatus, type AuthUser, type CreateBatchDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const sysadmin: AuthUser = { userId: 's', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const dto: CreateBatchDto = {
  ownerId: 'someoneElse', fieldId: 'f1', batchNo: 'B1', cropName: '白芍',
  plantDate: '2026-01-01T00:00:00.000Z', expectedHarvest: '2026-06-01T00:00:00.000Z',
  status: BatchStatus.PLANTING,
};

function make() {
  let created: any;
  const prisma = {
    batch: { create: async (a: any) => { created = a; return { id: 'b1', ...a.data }; } },
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'mX' }), findMany: vi.fn().mockResolvedValue([]) },
  };
  return { svc: new BatchService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('BatchService.create #23', () => {
  it('merchant:忽略 dto.ownerId,强制 ownerId=self', async () => {
    const h = make();
    await h.svc.create(merchant, dto);
    expect(h.created.data.ownerId).toBe('m1');
  });
  it('sysadmin:目标 owner 校验通过则采纳 dto.ownerId', async () => {
    const h = make();
    await h.svc.create(sysadmin, dto);
    expect(h.created.data.ownerId).toBe('someoneElse');
  });
  it('sysadmin:目标 owner 不在范围则抛 Forbidden', async () => {
    let created: any;
    const prisma = {
      batch: { create: async (a: any) => { created = a; return { id: 'b1', ...a.data }; } },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.create(sysadmin, dto)).rejects.toThrow();
    expect(created).toBeUndefined();
  });
});
