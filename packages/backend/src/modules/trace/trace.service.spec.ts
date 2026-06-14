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
  const prisma = {
    batch: { findFirst: vi.fn().mockResolvedValue(batchInScope ? { id: 'b1' } : null) },
    traceCode: { create: vi.fn().mockResolvedValue({ id: 'tc1' }) },
    traceEvent: {
      create: vi.fn().mockResolvedValue({ id: 'te1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { svc: new TraceService(prisma as any, new ScopeService()), prisma };
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
  it('generateCode:batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.generateCode(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceCode.create).not.toHaveBeenCalled();
  });
  it('listEvents:batch 不在范围则抛 Forbidden(不查询事件)', async () => {
    const h = make(false);
    await expect(h.svc.listEvents(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceEvent.findMany).not.toHaveBeenCalled();
  });
});
