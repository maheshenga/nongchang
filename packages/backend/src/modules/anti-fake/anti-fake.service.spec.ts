import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AntiFakeService } from './anti-fake.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const merchant: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };

function makeService(prismaOverrides: any) {
  const prisma = {
    batch: { findMany: async () => [], ...(prismaOverrides.batch ?? {}) },
    traceScan: { findMany: async () => [], ...(prismaOverrides.traceScan ?? {}) },
    traceCode: { findFirst: async () => null, update: async () => ({}), ...(prismaOverrides.traceCode ?? {}) },
  };
  return { svc: new AntiFakeService(prisma as any, new ScopeService()), prisma };
}

describe('AntiFakeService.listScans', () => {
  it('sysadmin 仅按 tenantId 过滤,倒序', async () => {
    let captured: any;
    const { svc } = makeService({
      traceScan: { findMany: async (args: any) => { captured = args; return [
        { id: 's1', code: 'C1', batchId: 'b1', ip: '1.1.1.1', userAgent: 'ua', scannedAt: new Date('2026-06-14T10:00:00Z') },
      ]; } },
    });
    const res = await svc.listScans(sysadmin, 50);
    expect(captured.where).toEqual({ tenantId: 't1' });
    expect(captured.orderBy).toEqual({ scannedAt: 'desc' });
    expect(captured.take).toBe(50);
    expect(res[0]).toEqual({ id: 's1', code: 'C1', batchId: 'b1', ip: '1.1.1.1', userAgent: 'ua', scannedAt: '2026-06-14T10:00:00.000Z' });
  });

  it('merchant 缺 ownerId 时 fail-closed 抛 Forbidden', async () => {
    const { svc } = makeService({});
    await expect(svc.listScans({ userId: 'u', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: null } as AuthUser, 50))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AntiFakeService.listAlerts', () => {
  function scan(code: string, ip: string, minutesAgo: number) {
    return { id: code + ip + minutesAgo, code, batchId: 'b-' + code, ip, userAgent: null,
      scannedAt: new Date(Date.now() - minutesAgo * 60_000) };
  }
  it('多 IP 且高频命中告警', async () => {
    const scans = [
      scan('HOT', '1.1.1.1', 5), scan('HOT', '2.2.2.2', 4), scan('HOT', '3.3.3.3', 3),
      scan('HOT', '1.1.1.1', 2), scan('HOT', '2.2.2.2', 1),
    ];
    const { svc } = makeService({
      traceScan: { findMany: async () => scans },
      traceCode: { findFirst: async ({ where }: any) => ({ code: where.code, status: 'active' }) },
    });
    const alerts = await svc.listAlerts(sysadmin);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe('HOT');
    expect(alerts[0].distinctIps).toBe(3);
    expect(alerts[0].scanCount).toBe(5);
    expect(alerts[0].frozen).toBe(false);
  });
  it('单 IP 高频不告警(IP 多样性不足)', async () => {
    const scans = [scan('SOLO','9.9.9.9',5), scan('SOLO','9.9.9.9',4), scan('SOLO','9.9.9.9',3), scan('SOLO','9.9.9.9',2), scan('SOLO','9.9.9.9',1)];
    const { svc } = makeService({ traceScan: { findMany: async () => scans } });
    expect(await svc.listAlerts(sysadmin)).toHaveLength(0);
  });
  it('多 IP 低频不告警(次数不足)', async () => {
    const scans = [scan('LOW','1.1.1.1',5), scan('LOW','2.2.2.2',4), scan('LOW','3.3.3.3',3)];
    const { svc } = makeService({ traceScan: { findMany: async () => scans } });
    expect(await svc.listAlerts(sysadmin)).toHaveLength(0);
  });
});

describe('AntiFakeService.freeze/unfreeze', () => {
  it('作用域内冻结成功置 frozen', async () => {
    let updated: any;
    const { svc } = makeService({
      traceCode: {
        findFirst: async () => ({ id: 'tc1', code: 'C1', status: 'active' }),
        update: async (args: any) => { updated = args; return { code: 'C1', status: 'frozen' }; },
      },
    });
    const res = await svc.freeze(merchant, 'C1');
    expect(updated.data.status).toBe('frozen');
    expect(res).toEqual({ code: 'C1', frozen: true });
  });
  it('越权(码不在作用域)抛 Forbidden', async () => {
    const { svc } = makeService({ traceCode: { findFirst: async () => null } });
    await expect(svc.freeze(merchant, 'OTHER')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('unfreeze 置回 active', async () => {
    const { svc } = makeService({
      traceCode: { findFirst: async () => ({ id: 'tc1', code: 'C1', status: 'frozen' }), update: async () => ({ code: 'C1', status: 'active' }) },
    });
    const res = await svc.unfreeze(merchant, 'C1');
    expect(res).toEqual({ code: 'C1', frozen: false });
  });
});
