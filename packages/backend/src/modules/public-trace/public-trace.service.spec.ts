import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';

function makePrisma(overrides: any = {}) {
  const { coords, ...rest } = overrides;
  const prisma: any = {
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
    // 经纬度通过 ST_X/ST_Y 原生查询提取,默认无坐标。
    $queryRawUnsafe: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue(coords ?? [{ lng: null, lat: null }]),
    traceEvent: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([
        { type: 'origin', title: '种苗', actor: '李', location: '大理', occurredAt: new Date('2023-04-12T09:30:00Z'), payload: { desc: 'x' } },
        { type: 'retail', title: '零售', actor: '店', location: '昆明', occurredAt: new Date('2026-05-12T10:00:00Z'), payload: null },
      ]),
    },
    traceCredential: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        { id: 'cr1', batchId: 'b1', type: 'certificate', title: '有机认证', issuer: '认证中心', serialNo: 'OC-1', issuedAt: new Date('2026-06-01T00:00:00Z'), fileUrl: 'https://oss/cert.pdf', createdAt: new Date() },
      ]),
    },
    traceScan: { create: vi.fn().mockResolvedValue({ id: 'scan1' }) },
    ...rest,
  };
  prisma.$transaction = rest.$transaction ?? vi.fn(async (fn: any) => fn(prisma));
  return prisma;
}

function makeService(prisma: any, mode: 'hidden' | 'approximate' | 'exact' = 'exact') {
  const settings = {
    getByTenantId: vi.fn().mockResolvedValue({
      publicCoordinateMode: mode,
      brandName: '农场溯源管理',
      industryName: '农业',
      defaultCropName: '作物',
      workbenchTitle: '农业工作台',
      defaultBaseLabel: '当前基地',
    }),
  };
  return { svc: new PublicTraceService(prisma, undefined, settings as any), settings };
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
    expect(res.credentials).toHaveLength(1);
    expect(res.credentials[0].type).toBe('certificate');
    expect(res.credentials[0].title).toBe('有机认证');
    expect(res.credentials[0].issuedAt).toBe('2026-06-01T00:00:00.000Z');
    // 脱敏:不应暴露内部 id/serialNo
    expect(res.credentials[0]).not.toHaveProperty('id');
    expect(res.credentials[0]).not.toHaveProperty('serialNo');
  });

  it('scanCount 原子自增并透传新值', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    expect(prisma.traceCode.update).toHaveBeenCalledWith({
      where: { code: 'ORC-X' }, data: { scanCount: { increment: 1 } },
      select: { scanCount: true },
    });
    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.scanCount).toBe(5);
  });

  it('does not increment scanCount when traceScan creation fails', async () => {
    const prisma = makePrisma({
      traceCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tc1', tenantId: 't1', batchId: 'b1', code: 'ORC-1', scanCount: 1,
        }),
        update: vi.fn().mockResolvedValue({ scanCount: 2 }),
      },
      traceScan: { create: vi.fn().mockRejectedValue(new Error('scan detail unavailable')) },
    });
    const service = new PublicTraceService(prisma);

    await expect(service.getByCode('ORC-1', { ip: '127.0.0.1', userAgent: null }))
      .rejects.toThrow('scan detail unavailable');
    expect(prisma.traceCode.update).not.toHaveBeenCalled();
    expect(prisma.traceScan.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not commit traceScan when scanCount update fails', async () => {
    let transactionCommitted = false;
    const prisma = makePrisma({
      traceCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tc1', tenantId: 't1', batchId: 'b1', code: 'ORC-1', scanCount: 1,
        }),
        update: vi.fn().mockRejectedValue(new Error('count update failed')),
      },
    });
    prisma.$transaction = vi.fn(async (callback: any) => {
      const result = await callback(prisma);
      transactionCommitted = true;
      return result;
    });
    const service = new PublicTraceService(prisma);

    await expect(service.getByCode('ORC-1', { ip: '127.0.0.1', userAgent: null }))
      .rejects.toThrow('count update failed');
    expect(prisma.traceScan.create).toHaveBeenCalledTimes(1);
    expect(transactionCommitted).toBe(false);
  });

  it('事件按 occurredAt 升序查询', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    await svc.getByCode('ORC-X');
    expect(prisma.traceEvent.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', batchId: 'b1' }, orderBy: { occurredAt: 'asc' }, take: 100,
    });
  });

  it('bounds static collections and returns their full totals', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);

    const res = await svc.getByCode('ORC-X');

    if (res.frozen) throw new Error('unexpected frozen response');
    expect(prisma.traceCredential.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', batchId: 'b1' }, orderBy: { createdAt: 'desc' }, take: 20,
    });
    expect(prisma.traceEvent.count).toHaveBeenCalledWith({ where: { tenantId: 't1', batchId: 'b1' } });
    expect(prisma.traceCredential.count).toHaveBeenCalledWith({ where: { tenantId: 't1', batchId: 'b1' } });
    expect(res.eventTotal).toBe(2);
    expect(res.credentialTotal).toBe(1);
  });

  it('reuses cached static data while scan writes remain live', async () => {
    const prisma = makePrisma({
      traceCode: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tc1', tenantId: 't1', batchId: 'b1', code: 'ORC-X', scanCount: 4 }),
        update: vi.fn()
          .mockResolvedValueOnce({ scanCount: 5 })
          .mockResolvedValueOnce({ scanCount: 6 }),
      },
    });
    const svc = new PublicTraceService(prisma);

    await svc.getByCode('ORC-X', { ip: '127.0.0.1', userAgent: 'first' });
    const second = await svc.getByCode('ORC-X', { ip: '127.0.0.2', userAgent: 'second' });

    if (second.frozen) throw new Error('unexpected frozen response');
    expect(second.scanCount).toBe(6);
    expect(prisma.batch.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.traceEvent.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.traceCode.update).toHaveBeenCalledTimes(2);
    expect(prisma.traceScan.create).toHaveBeenCalledTimes(2);
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

  it('地块有经纬度且天地图启用时返回 key 与坐标', async () => {
    const prisma = makePrisma({
      coords: [{ lng: 100.25, lat: 25.6 }],
      integrationConfig: { findUnique: vi.fn().mockResolvedValue({ provider: 'tianditu', enabled: true, appId: 'TDT_KEY' }) },
    });
    const { svc } = makeService(prisma, 'exact');
    const res = await svc.getByCode('ORC-X');
    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.batch.fieldLng).toBe(100.25);
    expect(res.batch.fieldLat).toBe(25.6);
    expect(res.tiandituKey).toBe('TDT_KEY');
  });

  it('默认隐藏模式不返回坐标且不查询天地图配置', async () => {
    const prisma = makePrisma({
      coords: [{ lng: 100.25, lat: 25.6 }],
      integrationConfig: { findUnique: vi.fn().mockResolvedValue({ provider: 'tianditu', enabled: true, appId: 'TDT_KEY' }) },
    });
    const { svc } = makeService(prisma, 'hidden');

    const res = await svc.getByCode('ORC-X');

    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.batch.fieldLng).toBeNull();
    expect(res.batch.fieldLat).toBeNull();
    expect(res.tiandituKey).toBeNull();
    expect(prisma.integrationConfig.findUnique).not.toHaveBeenCalled();
  });

  it('模糊模式仅返回两位小数坐标', async () => {
    const prisma = makePrisma({
      coords: [{ lng: 100.126, lat: 25.984 }],
      integrationConfig: { findUnique: vi.fn().mockResolvedValue({ provider: 'tianditu', enabled: true, appId: 'TDT_KEY' }) },
    });
    const { svc } = makeService(prisma, 'approximate');

    const res = await svc.getByCode('ORC-X');

    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.batch.fieldLng).toBe(100.13);
    expect(res.batch.fieldLat).toBe(25.98);
    expect(res.tiandituKey).toBe('TDT_KEY');
  });

  it('天地图未启用时 key 为 null', async () => {
    const prisma = makePrisma({
      coords: [{ lng: 100.25, lat: 25.6 }],
      integrationConfig: { findUnique: vi.fn().mockResolvedValue({ provider: 'tianditu', enabled: false, appId: 'TDT_KEY' }) },
    });
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.tiandituKey).toBeNull();
  });

  it('地块无经纬度时不查询集成配置且 key 为 null', async () => {
    const prisma = makePrisma();
    const svc = new PublicTraceService(prisma);
    const res = await svc.getByCode('ORC-X');
    if (res.frozen) throw new Error('未预期的 frozen 响应');
    expect(res.tiandituKey).toBeNull();
    expect(res.batch.fieldLng).toBeNull();
    expect(prisma.integrationConfig?.findUnique).toBeUndefined();
  });

  it('公开扫码不锁定 batch 行且在同一事务内先写明细再增加计数', async () => {
    const calls: string[] = [];
    const prisma = makePrisma({
      $queryRaw: vi.fn().mockResolvedValue([{ lng: null, lat: null }]),
      traceCode: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tc1', tenantId: 't1', batchId: 'b1', code: 'ORC-X', scanCount: 4 }),
        update: vi.fn(() => { calls.push('update-code'); return Promise.resolve({ scanCount: 5 }); }),
      },
      traceScan: {
        create: vi.fn(() => { calls.push('create-scan'); return Promise.resolve({ id: 'scan1' }); }),
      },
    });
    const { svc } = makeService(prisma, 'exact');
    await svc.getByCode('ORC-X', { ip: '127.0.0.1', userAgent: 'vitest' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['create-scan', 'update-code']);
  });
});
