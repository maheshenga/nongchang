import { describe, it, expect } from 'vitest';
import { PhenologyService } from './phenology.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };

const DAY = 86400000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

function makeService(batches: any[], phenologies: any[]) {
  const prisma = {
    batch: { findMany: async () => batches },
    cropPhenology: { findMany: async () => phenologies },
  } as any;
  return new PhenologyService(prisma, new ScopeService());
}

describe('PhenologyService.deviations', () => {
  it('标准全周期 = 各阶段 expectedDays 之和;超阈值则 alert', async () => {
    // 芍药标准全周期 = 30 + 60 = 90 天。批次种植 100 天前 → 滞后 10 天 > 阈值7 → 预警。
    const svc = makeService(
      [{ id: 'b1', batchNo: 'P-001', cropName: '芍药', status: 'Growing', plantDate: daysAgo(100) }],
      [
        { cropName: '芍药', expectedDays: 30 },
        { cropName: '芍药', expectedDays: 60 },
      ],
    );
    const res = await svc.deviations(sysadmin);
    expect(res).toHaveLength(1);
    expect(res[0].expectedTotalDays).toBe(90);
    expect(res[0].elapsedDays).toBe(100);
    expect(res[0].deviationDays).toBe(10);
    expect(res[0].noBaseline).toBe(false);
    expect(res[0].alert).toBe(true);
  });

  it('偏离在阈值内则不预警', async () => {
    const svc = makeService(
      [{ id: 'b1', batchNo: 'P-001', cropName: '芍药', status: 'Growing', plantDate: daysAgo(93) }],
      [{ cropName: '芍药', expectedDays: 90 }],
    );
    const res = await svc.deviations(sysadmin);
    expect(res[0].deviationDays).toBe(3);
    expect(res[0].alert).toBe(false);
  });

  it('已收获批次即便滞后也不预警(生命周期已结束)', async () => {
    const svc = makeService(
      [{ id: 'b1', batchNo: 'P-001', cropName: '芍药', status: 'Harvested', plantDate: daysAgo(200) }],
      [{ cropName: '芍药', expectedDays: 90 }],
    );
    const res = await svc.deviations(sysadmin);
    expect(res[0].deviationDays).toBe(110);
    expect(res[0].alert).toBe(false);
  });

  it('作物无物候基准则 noBaseline=true 且不预警', async () => {
    const svc = makeService(
      [{ id: 'b1', batchNo: 'X-001', cropName: '未知作物', status: 'Growing', plantDate: daysAgo(300) }],
      [{ cropName: '芍药', expectedDays: 90 }],
    );
    const res = await svc.deviations(sysadmin);
    expect(res[0].noBaseline).toBe(true);
    expect(res[0].expectedTotalDays).toBeNull();
    expect(res[0].deviationDays).toBeNull();
    expect(res[0].alert).toBe(false);
  });
});
