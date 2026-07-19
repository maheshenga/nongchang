import { describe, it, expect, vi } from 'vitest';
import { TraceService } from './trace.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, TraceEventType, type AuthUser, type CreateTraceEventDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const evt: CreateTraceEventDto = {
  batchId: 'b1', type: TraceEventType.FARM, title: '施肥', actor: '张三',
  location: 'A区', occurredAt: '2026-06-14T10:00:00.000Z',
};

function make(batchInScope = true) {
  const created: any[] = [];
  const billing = {
    reserve: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    confirmReservation: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    releaseReservation: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
  };
  const cache = { invalidateBatch: vi.fn() };
  const prisma = {
    batch: { findFirst: vi.fn().mockResolvedValue(batchInScope ? { id: 'b1' } : null) },
    traceCode: {
      create: vi.fn().mockResolvedValue({ id: 'tc1' }),
      createMany: vi.fn().mockImplementation(async ({ data }: any) => { created.push(...data); return { count: data.length }; }),
      findMany: vi.fn().mockImplementation(async (q?: any) => {
        if (q?.where?.generationKey) return created.filter((c) => c.generationKey === q.where.generationKey);
        if (q?.where?.tenantId && q?.where?.batchId && q?.where?.generationKey === undefined) return created.filter((c) => c.tenantId === q.where.tenantId && c.batchId === q.where.batchId);
        if (q?.where?.code?.in) return created.filter((c) => q.where.code.in.includes(c.code));
        return created;
      }),
    },
    traceEvent: {
      create: vi.fn().mockResolvedValue({ id: 'te1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'b1' }]),
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { svc: new TraceService(prisma as any, new ScopeService(), billing as any, cache as any), prisma, created, billing, cache };
}

describe('TraceService #24 batch 归属校验', () => {
  it('addEvent:batch 在范围内则创建', async () => {
    const h = make(true);
    await h.svc.addEvent(merchant, evt);
    expect(h.prisma.traceEvent.create).toHaveBeenCalled();
    expect(h.cache.invalidateBatch).toHaveBeenCalledWith('b1');
  });
  it('addEvent:batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.addEvent(merchant, evt)).rejects.toThrow();
    expect(h.prisma.traceEvent.create).not.toHaveBeenCalled();
  });
  it('listEvents:batch 不在范围则抛 Forbidden(不查询事件)', async () => {
    const h = make(false);
    await expect(h.svc.listEvents(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceEvent.findMany).not.toHaveBeenCalled();
  });
});

describe('TraceService.generateCodes 批量', () => {
  it('生成指定数量的唯一码并返回列表', async () => {
    const h = make(true);
    const out = await h.svc.generateCodes(merchant, 'b1', 5, 'req-success');
    expect(out.length).toBe(5);
    expect(h.prisma.traceCode.createMany).toHaveBeenCalled();
    const codes = h.created.map((c) => c.code);
    expect(new Set(codes).size).toBe(5); // 全部唯一
    codes.forEach((c) => expect(c).toMatch(/^ORC-/));
  });
  it('count 缺省为 1', async () => {
    const h = make(true);
    const out = await h.svc.generateCodes(merchant, 'b1', 1, 'req-default-count');
    expect(out.length).toBe(1);
  });
  it('batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.generateCodes(merchant, 'b1', 3, 'req-out-of-scope')).rejects.toThrow();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });
  it('count 非法(0 或超上限)抛错', async () => {
    const h = make(true);
    await expect(h.svc.generateCodes(merchant, 'b1', 0)).rejects.toThrow();
    await expect(h.svc.generateCodes(merchant, 'b1', 100000)).rejects.toThrow();
  });
});

describe('TraceService.listCodes 已生成码列表', () => {
  it('batch 在范围内则按 tenant+batch 查询(未分页带安全上限 take)', async () => {
    const h = make(true);
    await h.svc.listCodes(merchant, 'b1');
    expect(h.prisma.traceCode.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', batchId: 'b1' }, orderBy: { createdAt: 'desc' }, take: 10000,
    });
  });
  it('batch 不在范围则抛 Forbidden(不查询)', async () => {
    const h = make(false);
    await expect(h.svc.listCodes(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceCode.findMany).not.toHaveBeenCalled();
  });
});

describe('TraceService.generateCodes 扣费插桩', () => {
  it('缺少客户端请求键时拒绝生码,避免不可重试的随机扣费', async () => {
    const h = make(true);
    await expect(h.svc.generateCodes(merchant, 'b1', 1)).rejects.toThrow('缺少幂等键');

    expect(h.billing.reserve).not.toHaveBeenCalled();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });

  it('reserves and confirms CODE when code generation succeeds', async () => {
    const h = make(true);
    await h.svc.generateCodes(merchant, 'b1', 5, 'req-reserve-success');
    expect(h.billing.reserve).toHaveBeenCalledWith(merchant, 'CODE', 5, expect.objectContaining({ refType: 'trace.generate', refId: 'b1' }));
    expect(h.billing.confirmReservation).toHaveBeenCalledWith(merchant, 'CODE', expect.objectContaining({ refType: 'trace.generate', refId: 'b1' }));
    expect(h.billing.releaseReservation).not.toHaveBeenCalled();
  });
  it('同一客户端请求键使用稳定幂等键', async () => {
    const h = make(true);
    await h.svc.generateCodes(merchant, 'b1', 5, 'req-1');
    await h.svc.generateCodes(merchant, 'b1', 5, 'req-2');

    const firstRef = h.billing.reserve.mock.calls[0][3];
    const secondRef = h.billing.reserve.mock.calls[1][3];
    expect(firstRef.idempotencyKey).toBe('trace.generate:t1:op1:b1:req-1');
    expect(secondRef.idempotencyKey).toBe('trace.generate:t1:op1:b1:req-2');
  });
  it('同一客户端请求键重复调用返回已生成码,不再次扣费或建码', async () => {
    const h = make(true);
    const first = await h.svc.generateCodes(merchant, 'b1', 2, 'req-repeat');
    h.billing.reserve.mockClear();
    h.billing.confirmReservation.mockClear();
    h.prisma.traceCode.createMany.mockClear();

    const second = await h.svc.generateCodes(merchant, 'b1', 2, 'req-repeat');

    expect(second).toEqual(first);
    expect(h.billing.reserve).not.toHaveBeenCalled();
    expect(h.billing.confirmReservation).toHaveBeenCalledWith(merchant, 'CODE', expect.objectContaining({ idempotencyKey: 'trace.generate:t1:op1:b1:req-repeat' }));
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });
  it('同一客户端请求键 count 变化时拒绝,避免错把新请求当重试', async () => {
    const h = make(true);
    await h.svc.generateCodes(merchant, 'b1', 2, 'req-same-key');
    h.billing.reserve.mockClear();
    h.billing.confirmReservation.mockClear();
    h.prisma.traceCode.createMany.mockClear();

    await expect(h.svc.generateCodes(merchant, 'b1', 5, 'req-same-key')).rejects.toThrow('幂等键已用于生成 2 个溯源码');

    expect(h.billing.reserve).not.toHaveBeenCalled();
    expect(h.billing.confirmReservation).not.toHaveBeenCalled();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });
  it('同一客户端请求键已有 codes 但确认失败后重试会补确认', async () => {
    const h = make(true);
    h.billing.confirmReservation.mockRejectedValueOnce(new Error('confirm down'));
    await expect(h.svc.generateCodes(merchant, 'b1', 2, 'req-confirm-retry')).rejects.toThrow('confirm down');
    h.billing.reserve.mockClear();
    h.billing.confirmReservation.mockClear();
    h.prisma.traceCode.createMany.mockClear();

    const second = await h.svc.generateCodes(merchant, 'b1', 2, 'req-confirm-retry');

    expect(second).toHaveLength(2);
    expect(h.billing.reserve).not.toHaveBeenCalled();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
    expect(h.billing.confirmReservation).toHaveBeenCalledWith(merchant, 'CODE', expect.objectContaining({ idempotencyKey: 'trace.generate:t1:op1:b1:req-confirm-retry' }));
  });
  it('余额不足则不创建码', async () => {
    const h = make(true);
    h.billing.reserve.mockRejectedValueOnce(new Error('insufficient'));
    await expect(h.svc.generateCodes(merchant, 'b1', 3, 'req-insufficient')).rejects.toThrow();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });
  it('写入成功但后续读取失败时不应退款', async () => {
    const h = make(true);
    h.prisma.traceCode.findMany
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockRejectedValueOnce(new Error('read failed'));
    await expect(h.svc.generateCodes(merchant, 'b1', 2, 'req-read-fails')).rejects.toThrow('read failed');
    expect(h.billing.reserve).toHaveBeenCalledWith(merchant, 'CODE', 2, expect.objectContaining({ refType: 'trace.generate', refId: 'b1' }));
    expect(h.billing.confirmReservation).toHaveBeenCalledWith(merchant, 'CODE', expect.objectContaining({ refType: 'trace.generate', refId: 'b1' }));
    expect(h.billing.releaseReservation).not.toHaveBeenCalled();
  });
  it('batch 不在范围则不扣费', async () => {
    const h = make(false);
    await expect(h.svc.generateCodes(merchant, 'b1', 3, 'req-no-billing')).rejects.toThrow();
    expect(h.billing.reserve).not.toHaveBeenCalled();
  });
  it('建码失败则释放已预约额度并重抛', async () => {
    const h = make(true);
    h.prisma.traceCode.createMany.mockRejectedValueOnce(new Error('db down'));
    await expect(h.svc.generateCodes(merchant, 'b1', 4, 'req-create-fails')).rejects.toThrow('db down');
    expect(h.billing.reserve).toHaveBeenCalledWith(merchant, 'CODE', 4, expect.objectContaining({ refType: 'trace.generate', refId: 'b1' }));
    expect(h.billing.releaseReservation).toHaveBeenCalledWith(merchant, 'CODE', 4, expect.objectContaining({ refType: 'trace.generate', refId: 'b1' }));
    expect(h.billing.confirmReservation).not.toHaveBeenCalled();
  });

  it('建码前在同一事务内锁定 batch 行', async () => {
    const h = make(true);
    const calls: string[] = [];
    h.prisma.$queryRaw.mockImplementation(() => {
      calls.push('lock-batch');
      return Promise.resolve([{ id: 'b1' }]);
    });
    h.prisma.traceCode.createMany.mockImplementation(async ({ data }: any) => {
      calls.push('create-codes');
      h.created.push(...data);
      return { count: data.length };
    });

    await h.svc.generateCodes(merchant, 'b1', 2, 'req-lock-before-create');

    expect(h.prisma.$transaction).toHaveBeenCalled();
    expect(calls).toEqual(['lock-batch', 'create-codes']);
  });
});
