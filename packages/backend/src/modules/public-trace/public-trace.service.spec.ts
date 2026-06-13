import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';

function makePrisma(overrides: any = {}) {
  return {
    traceCode: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tc1', tenantId: 't1', batchId: 'b1', code: 'ORC-X', scanCount: 4 }),
      update: vi.fn().mockResolvedValue({ scanCount: 5 }),
    },
    batch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1', tenantId: 't1', ownerId: 'm1', fieldId: 'f1', batchNo: 'PA-1',
        cropName: '白芍', plantDate: new Date('2023-10-15T00:00:00Z'),
        expectedHarvest: new Date('2026-05-10T00:00:00Z'), status: 'Harvested',
      }),
    },
    field: { findUnique: vi.fn().mockResolvedValue({ id: 'f1', name: 'A区露地', ownerId: 'm1' }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', agentId: 'a1' }) },
    agent: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', region: '云南' }) },
    traceEvent: {
      findMany: vi.fn().mockResolvedValue([
        { type: 'origin', title: '种苗', actor: '李', location: '大理', occurredAt: new Date('2023-04-12T09:30:00Z'), payload: { desc: 'x' } },
        { type: 'retail', title: '零售', actor: '店', location: '昆明', occurredAt: new Date('2026-05-12T10:00:00Z'), payload: null },
      ]),
    },
    ...overrides,
  } as any;
}

describe('PublicTraceService.getByCode', () => {
  it('无效 code 抛 NotFoundException', async () => {
    const prisma = makePrisma({ traceCode: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } });
    const svc = new PublicTraceService(prisma);
    await expect(svc.getByCode('NOPE')).rejects.toThrow(NotFoundException);
    expect(prisma.traceCode.update).not.toHaveBeenCalled();
  });

  it('有效 code 返回组装后的脱敏响应', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.code).toBe('ORC-X');
    expect(res.batch.cropName).toBe('白芍');
    expect(res.batch.fieldName).toBe('A区露地');
    expect(res.batch.region).toBe('云南');
    expect(res.batch.status).toBe('Harvested');
    expect(res.events).toHaveLength(2);
    expect(res.events[0].type).toBe('origin');
    expect(typeof res.batch.plantDate).toBe('string');
  });

  it('scanCount 原子自增并透传新值', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    expect(prisma.traceCode.update).toHaveBeenCalledWith({
      where: { code: 'ORC-X' }, data: { scanCount: { increment: 1 } },
    });
    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.scanCount).toBe(5);
  });

  it('事件按 occurredAt 升序查询', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    await svc.getByCode('ORC-X');
    expect(prisma.traceEvent.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', batchId: 'b1' }, orderBy: { occurredAt: 'asc' },
    });
  });

  it('响应不含任何内部字段(脱敏)', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    const json = JSON.stringify(res);
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('ownerId');
    expect(json).not.toContain('t1');
    expect(json).not.toContain('m1');
    expect(json).not.toContain('fieldId');
    expect(json).not.toContain('batchId');
  });
});
