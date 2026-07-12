import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { ScopeService } from '../../common/scope/scope.service';
import { AntiFakeService } from './anti-fake.service';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const merchant: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const agent: AuthUser = { userId: 'u3', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null };

function makeService(overrides: Record<string, any> = {}) {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    traceScan: { findMany: vi.fn().mockResolvedValue([]) },
    traceCode: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return { svc: new AntiFakeService(prisma as any, new ScopeService()), prisma };
}

describe('AntiFakeService.listScans', () => {
  it('keeps list rows bounded and tenant scoped', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 's1', code: 'C1', batchId: 'b1', ip: '1.1.1.1', userAgent: 'ua',
      scannedAt: new Date('2026-07-13T00:00:00.000Z'),
    }]);
    const { svc } = makeService({ traceScan: { findMany } });

    await expect(svc.listScans(sysadmin, 50)).resolves.toEqual([{
      id: 's1', code: 'C1', batchId: 'b1', ip: '1.1.1.1', userAgent: 'ua',
      scannedAt: '2026-07-13T00:00:00.000Z',
    }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' }, orderBy: { scannedAt: 'desc' }, take: 50,
    });
  });

  it('fails closed when merchant owner identity is missing', async () => {
    const { svc } = makeService();
    await expect(svc.listScans({ ...merchant, ownerId: null }, 50)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AntiFakeService.listAlerts', () => {
  it('uses one parameterized aggregate query and normalizes database rows', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      code: 'HOT', batchId: 'b1', distinctIps: 3n, scanCount: 5n,
      locations: ['1.1.1.1', '2.2.2.2', '3.3.3.3'],
      lastScanAt: new Date('2026-07-13T00:30:00.000Z'), frozen: false,
    }]);
    const { svc, prisma } = makeService({ $queryRaw: queryRaw });

    const alerts = await svc.listAlerts(sysadmin, {
      windowMinutes: 60, minScans: 5, minDistinctIps: 3, limit: 20,
      now: new Date('2026-07-13T01:00:00.000Z'),
    });

    expect(alerts).toEqual([{
      code: 'HOT', batchId: 'b1', distinctIps: 3, scanCount: 5,
      locations: ['1.1.1.1', '2.2.2.2', '3.3.3.3'],
      lastScanAt: '2026-07-13T00:30:00.000Z', frozen: false,
    }]);
    expect(prisma.traceScan.findMany).not.toHaveBeenCalled();
    const [strings, ...values] = queryRaw.mock.calls[0];
    const sql = Array.from(strings as TemplateStringsArray).join('?');
    expect(sql).toContain('COUNT(DISTINCT s.ip)');
    expect(sql).toContain('ORDER BY "scanCount" DESC, "distinctIps" DESC, s.code ASC');
    expect(values).toEqual(expect.arrayContaining(['t1', 5, 3, 20]));
  });

  it('passes merchant and agent scope into the aggregate query', async () => {
    const merchantRaw = vi.fn().mockResolvedValue([]);
    const agentRaw = vi.fn().mockResolvedValue([]);
    await makeService({ $queryRaw: merchantRaw }).svc.listAlerts(merchant);
    await makeService({ $queryRaw: agentRaw }).svc.listAlerts(agent);

    expect(merchantRaw.mock.calls[0].flat()).toContain('m1');
    expect(agentRaw.mock.calls[0].flat()).toContain('a1');
  });

  it('fails closed before querying when required scope identity is missing', async () => {
    const { svc, prisma } = makeService();
    await expect(svc.listAlerts({ ...merchant, ownerId: null })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('AntiFakeService.freeze/unfreeze', () => {
  it('updates an in-scope code and returns its frozen state', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'tc1', code: 'C1' });
    const update = vi.fn().mockResolvedValue({});
    const { svc } = makeService({ traceCode: { findFirst, update } });

    await expect(svc.freeze(merchant, 'C1')).resolves.toEqual({ code: 'C1', frozen: true });
    expect(update).toHaveBeenCalledWith({ where: { code: 'C1' }, data: { status: 'frozen' } });
    await expect(svc.unfreeze(merchant, 'C1')).resolves.toEqual({ code: 'C1', frozen: false });
  });

  it('rejects codes outside the caller scope', async () => {
    const { svc } = makeService();
    await expect(svc.freeze(merchant, 'OTHER')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
