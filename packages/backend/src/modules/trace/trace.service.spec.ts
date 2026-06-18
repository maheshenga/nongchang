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
  const billing = { consume: vi.fn().mockResolvedValue({ balanceAfter: 0 }), refund: vi.fn().mockResolvedValue({ balanceAfter: 0 }) };
  const prisma = {
    batch: { findFirst: vi.fn().mockResolvedValue(batchInScope ? { id: 'b1' } : null) },
    traceCode: {
      create: vi.fn().mockResolvedValue({ id: 'tc1' }),
      createMany: vi.fn().mockImplementation(async ({ data }: any) => { created.push(...data); return { count: data.length }; }),
      findMany: vi.fn().mockImplementation(async () => created),
    },
    traceEvent: {
      create: vi.fn().mockResolvedValue({ id: 'te1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { svc: new TraceService(prisma as any, new ScopeService(), billing as any), prisma, created, billing };
}

describe('TraceService #24 batch 归属校验', () => {
  it('addEvent:batch 在范围内则创建', async () => {
    const h = make(true);
    await h.svc.addEvent(merchant, evt);
    expect(h.prisma.traceEvent.create).toHaveBeenCalled();
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
    const out = await h.svc.generateCodes(merchant, 'b1', 5);
    expect(out.length).toBe(5);
    expect(h.prisma.traceCode.createMany).toHaveBeenCalled();
    const codes = h.created.map((c) => c.code);
    expect(new Set(codes).size).toBe(5); // 全部唯一
    codes.forEach((c) => expect(c).toMatch(/^ORC-/));
  });
  it('count 缺省为 1', async () => {
    const h = make(true);
    const out = await h.svc.generateCodes(merchant, 'b1');
    expect(out.length).toBe(1);
  });
  it('batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.generateCodes(merchant, 'b1', 3)).rejects.toThrow();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });
  it('count 非法(0 或超上限)抛错', async () => {
    const h = make(true);
    await expect(h.svc.generateCodes(merchant, 'b1', 0)).rejects.toThrow();
    await expect(h.svc.generateCodes(merchant, 'b1', 100000)).rejects.toThrow();
  });
});

describe('TraceService.listCodes 已生成码列表', () => {
  it('batch 在范围内则按 tenant+batch 查询', async () => {
    const h = make(true);
    await h.svc.listCodes(merchant, 'b1');
    expect(h.prisma.traceCode.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', batchId: 'b1' }, orderBy: { createdAt: 'desc' },
    });
  });
  it('batch 不在范围则抛 Forbidden(不查询)', async () => {
    const h = make(false);
    await expect(h.svc.listCodes(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceCode.findMany).not.toHaveBeenCalled();
  });
});

describe('TraceService.generateCodes 扣费插桩', () => {
  it('生成成功后扣 CODE = count', async () => {
    const h = make(true);
    await h.svc.generateCodes(merchant, 'b1', 5);
    expect(h.billing.consume).toHaveBeenCalledWith(merchant, 'CODE', 5, { refType: 'trace.generate', refId: 'b1' });
  });
  it('余额不足则不创建码', async () => {
    const h = make(true);
    h.billing.consume.mockRejectedValueOnce(new Error('insufficient'));
    await expect(h.svc.generateCodes(merchant, 'b1', 3)).rejects.toThrow();
    expect(h.prisma.traceCode.createMany).not.toHaveBeenCalled();
  });
  it('batch 不在范围则不扣费', async () => {
    const h = make(false);
    await expect(h.svc.generateCodes(merchant, 'b1', 3)).rejects.toThrow();
    expect(h.billing.consume).not.toHaveBeenCalled();
  });
  it('建码失败则退还已扣额度并重抛', async () => {
    const h = make(true);
    h.prisma.traceCode.createMany.mockRejectedValueOnce(new Error('db down'));
    await expect(h.svc.generateCodes(merchant, 'b1', 4)).rejects.toThrow('db down');
    expect(h.billing.consume).toHaveBeenCalledWith(merchant, 'CODE', 4, { refType: 'trace.generate', refId: 'b1' });
    expect(h.billing.refund).toHaveBeenCalledWith(merchant, 'CODE', 4, { refType: 'trace.generate', refId: 'b1' });
  });
});
