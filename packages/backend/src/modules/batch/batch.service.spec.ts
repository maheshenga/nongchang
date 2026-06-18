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
    field: { findFirst: vi.fn().mockResolvedValue({ id: 'f1' }) },
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

  it('fieldId 不在调用方范围则抛 Forbidden 且不创建', async () => {
    let created: any;
    const prisma = {
      batch: { create: async (a: any) => { created = a; return { id: 'b1', ...a.data }; } },
      field: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'mX' }), findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.create(merchant, dto)).rejects.toThrow();
    expect(created).toBeUndefined();
  });
});

describe('BatchService.findByTraceCode #D④', () => {
  const batchRow = { id: 'b1', tenantId: 't1', ownerId: 'm1', fieldId: 'f1', batchNo: 'PA-1', cropName: '白芍' };

  it('命中:解析溯源码→归属校验通过→返回批次', async () => {
    const prisma = {
      traceCode: { findFirst: vi.fn().mockResolvedValue({ id: 'tc1', code: 'C1', batchId: 'b1', tenantId: 't1' }) },
      batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }), findUnique: vi.fn().mockResolvedValue(batchRow) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    const out = await svc.findByTraceCode(merchant, 'C1');
    expect(out).toEqual(batchRow);
    expect(prisma.traceCode.findFirst).toHaveBeenCalledWith({ where: { code: 'C1', tenantId: 't1' } });
  });

  it('溯源码不存在:抛 NotFound', async () => {
    const prisma = {
      traceCode: { findFirst: vi.fn().mockResolvedValue(null) },
      batch: { findFirst: vi.fn(), findUnique: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.findByTraceCode(merchant, 'nope')).rejects.toThrow();
    expect(prisma.batch.findUnique).not.toHaveBeenCalled();
  });

  it('越权:批次不在调用方范围则抛 Forbidden', async () => {
    const prisma = {
      traceCode: { findFirst: vi.fn().mockResolvedValue({ id: 'tc1', code: 'C1', batchId: 'bX', tenantId: 't1' }) },
      batch: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.findByTraceCode(merchant, 'C1')).rejects.toThrow();
    expect(prisma.batch.findUnique).not.toHaveBeenCalled();
  });
});

describe('BatchService.list 聚合 #全域批次追踪', () => {
  it('聚合 codeCount/scanTotal/inputCost', async () => {
    const prisma = {
      batch: { findMany: vi.fn().mockResolvedValue([
        { id: 'b1', tenantId: 't1', ownerId: 'm1', status: 'planting', laborCost: 0, sellPrice: 0 },
      ]) },
      traceCode: { groupBy: vi.fn().mockResolvedValue([
        { batchId: 'b1', _count: { _all: 3 }, _sum: { scanCount: 12 } },
      ]) },
      supplyIssue: { findMany: vi.fn().mockResolvedValue([
        { batchId: 'b1', amount: 10, unitPrice: 5 },
        { batchId: 'b1', amount: 2, unitPrice: 3 },
      ]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    const out = await svc.list(merchant);
    expect(out).toHaveLength(1);
    expect(out[0].codeCount).toBe(3);
    expect(out[0].scanTotal).toBe(12);
    expect(out[0].inputCost).toBe(56);
  });

  it('空集:不调用 groupBy/supplyIssue.findMany,返回 []', async () => {
    const prisma = {
      batch: { findMany: vi.fn().mockResolvedValue([]) },
      traceCode: { groupBy: vi.fn() },
      supplyIssue: { findMany: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    const out = await svc.list(merchant);
    expect(out).toEqual([]);
    expect(prisma.traceCode.groupBy).not.toHaveBeenCalled();
    expect(prisma.supplyIssue.findMany).not.toHaveBeenCalled();
  });
});

describe('BatchService.updateStatus #全域批次追踪', () => {
  function makeStatus(curStatus: string, inScope = true) {
    const prisma = {
      batch: {
        findFirst: vi.fn().mockResolvedValue(inScope ? { id: 'b1' } : null),
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: curStatus }),
        update: vi.fn().mockResolvedValue({ id: 'b1' }),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    return { prisma, svc: new BatchService(prisma, new ScopeService()) };
  }

  it('合法前进 PLANTING→GROWING', async () => {
    const { prisma, svc } = makeStatus(BatchStatus.PLANTING);
    await svc.updateStatus(merchant, 'b1', BatchStatus.GROWING);
    expect(prisma.batch.update).toHaveBeenCalled();
  });

  it('跳级前进 PLANTING→HARVESTED 合法', async () => {
    const { prisma, svc } = makeStatus(BatchStatus.PLANTING);
    await svc.updateStatus(merchant, 'b1', BatchStatus.HARVESTED);
    expect(prisma.batch.update).toHaveBeenCalled();
  });

  it('回退 HARVESTED→GROWING 非法', async () => {
    const { prisma, svc } = makeStatus(BatchStatus.HARVESTED);
    await expect(svc.updateStatus(merchant, 'b1', BatchStatus.GROWING)).rejects.toThrow();
    expect(prisma.batch.update).not.toHaveBeenCalled();
  });

  it('同态 GROWING→GROWING 非法', async () => {
    const { prisma, svc } = makeStatus(BatchStatus.GROWING);
    await expect(svc.updateStatus(merchant, 'b1', BatchStatus.GROWING)).rejects.toThrow();
    expect(prisma.batch.update).not.toHaveBeenCalled();
  });

  it('越权 → Forbidden 且不 update', async () => {
    const { prisma, svc } = makeStatus(BatchStatus.PLANTING, false);
    await expect(svc.updateStatus(merchant, 'b1', BatchStatus.GROWING)).rejects.toThrow();
    expect(prisma.batch.update).not.toHaveBeenCalled();
  });
});

describe('BatchService.updateCost #全域批次追踪', () => {
  it('正常:update data 含 laborCost/sellPrice', async () => {
    const prisma = {
      batch: {
        findFirst: vi.fn().mockResolvedValue({ id: 'b1' }),
        update: vi.fn().mockResolvedValue({ id: 'b1' }),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await svc.updateCost(merchant, 'b1', { laborCost: 100, sellPrice: 200 });
    expect(prisma.batch.update).toHaveBeenCalled();
    const arg = prisma.batch.update.mock.calls[0][0];
    expect(arg.data.laborCost).toBe(100);
    expect(arg.data.sellPrice).toBe(200);
  });

  it('越权 → Forbidden', async () => {
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.updateCost(merchant, 'b1', { laborCost: 1 })).rejects.toThrow();
    expect(prisma.batch.update).not.toHaveBeenCalled();
  });
});

describe('BatchService.lifecycle #全域批次追踪', () => {
  it('正常:返回 batch/farmRecords/traceEvents/codeCount/scanTotal/recentScans', async () => {
    const prisma = {
      batch: {
        findFirst: vi.fn().mockResolvedValue({ id: 'b1' }),
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', status: 'growing' }),
      },
      farmRecord: { findMany: vi.fn().mockResolvedValue([{ id: 'fr1' }]) },
      traceEvent: { findMany: vi.fn().mockResolvedValue([{ id: 'te1' }]) },
      traceCode: { aggregate: vi.fn().mockResolvedValue({ _count: { _all: 5 }, _sum: { scanCount: 20 } }) },
      traceScan: { findMany: vi.fn().mockResolvedValue([{ scannedAt: new Date('2026-06-01') }]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    const out = await svc.lifecycle(merchant, 'b1');
    expect(out.batch).toEqual({ id: 'b1', status: 'growing' });
    expect(out.farmRecords).toHaveLength(1);
    expect(out.traceEvents).toHaveLength(1);
    expect(out.codeCount).toBe(5);
    expect(out.scanTotal).toBe(20);
    expect(out.recentScans).toHaveLength(1);
    expect(Object.keys(out.recentScans[0])).toEqual(['scannedAt']);
    expect(prisma.traceScan.findMany.mock.calls[0][0].select).toEqual({ scannedAt: true });
  });

  it('越权 → Forbidden 且不查 farmRecord', async () => {
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn() },
      farmRecord: { findMany: vi.fn() },
      traceEvent: { findMany: vi.fn() },
      traceCode: { aggregate: vi.fn() },
      traceScan: { findMany: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.lifecycle(merchant, 'b1')).rejects.toThrow();
    expect(prisma.farmRecord.findMany).not.toHaveBeenCalled();
  });
});

describe('BatchService.remove 删除批次', () => {
  it('无溯源码则连带删农事记录后删批次', async () => {
    const tx = vi.fn().mockResolvedValue([{ count: 2 }, { id: 'b1' }]);
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }), delete: vi.fn() },
      farmRecord: { deleteMany: vi.fn() },
      traceScan: { deleteMany: vi.fn() },
      traceEvent: { deleteMany: vi.fn() },
      traceCredential: { deleteMany: vi.fn() },
      traceCode: { count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn() },
      supplyIssue: { deleteMany: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: tx,
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    const out = await svc.remove(merchant, 'b1');
    expect(out).toEqual({ id: 'b1' });
    expect(prisma.traceCode.count).toHaveBeenCalledWith({ where: { batchId: 'b1' } });
    expect(tx).toHaveBeenCalled();
  });

  it('已签发溯源码且非强制则拒绝删除(不进事务)', async () => {
    const tx = vi.fn();
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }), delete: vi.fn() },
      farmRecord: { deleteMany: vi.fn() },
      traceCode: { count: vi.fn().mockResolvedValue(3) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: tx,
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.remove(merchant, 'b1')).rejects.toThrow();
    expect(tx).not.toHaveBeenCalled();
  });

  it('已签发溯源码但 force=true 且未被扫码则强制连带清理后删除', async () => {
    const tx = vi.fn().mockResolvedValue([]);
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }), delete: vi.fn() },
      farmRecord: { deleteMany: vi.fn() },
      traceScan: { count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn() },
      traceEvent: { deleteMany: vi.fn() },
      traceCredential: { deleteMany: vi.fn() },
      traceCode: { count: vi.fn().mockResolvedValue(5), deleteMany: vi.fn() },
      supplyIssue: { deleteMany: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: tx,
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    const out = await svc.remove(merchant, 'b1', true);
    expect(out).toEqual({ id: 'b1' });
    expect(tx).toHaveBeenCalled();
  });

  it('溯源码已被扫码流通则即使 force 也禁止硬删(防溯源死链)', async () => {
    const tx = vi.fn();
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }), delete: vi.fn() },
      traceScan: { count: vi.fn().mockResolvedValue(7), deleteMany: vi.fn() },
      traceCode: { count: vi.fn().mockResolvedValue(5) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: tx,
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.remove(merchant, 'b1', true)).rejects.toThrow();
    expect(tx).not.toHaveBeenCalled();
  });

  it('越权 → Forbidden 且不查码数', async () => {
    const prisma = {
      batch: { findFirst: vi.fn().mockResolvedValue(null), delete: vi.fn() },
      farmRecord: { deleteMany: vi.fn() },
      traceCode: { count: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.remove(merchant, 'b1')).rejects.toThrow();
    expect(prisma.traceCode.count).not.toHaveBeenCalled();
  });
});
