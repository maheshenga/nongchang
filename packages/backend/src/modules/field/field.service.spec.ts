import { describe, it, expect, vi } from 'vitest';
import { FieldService } from './field.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser, type CreateFieldDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const sysadmin: AuthUser = { userId: 's', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const dto: CreateFieldDto = { ownerId: 'someoneElse', name: 'A区', area: 10, lng: 100, lat: 25 };

function make(ownerFound = true, overrides: { coordinateWriteError?: Error } = {}) {
  let created: any;
  let transactionCommitted = false;
  const cache = { invalidateTenant: vi.fn().mockResolvedValue(undefined) };
  const tx = {
    field: {
      create: vi.fn(async (a: any) => {
        created = a;
        return {
          id: 'f1',
          ...a.data,
          createdAt: new Date('2026-06-14T10:00:00.000Z'),
        };
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ displayName: '张三农场' }),
    },
    $executeRawUnsafe: vi.fn(async () => {
      if (overrides.coordinateWriteError) throw overrides.coordinateWriteError;
      return 1;
    }),
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'f1', lng: 100, lat: 25 }]),
  };
  const prisma = {
    field: tx.field,
    user: {
      findFirst: vi.fn().mockResolvedValue(ownerFound ? { id: 'mX' } : null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $executeRawUnsafe: tx.$executeRawUnsafe,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const result = await callback(tx);
      transactionCommitted = true;
      return result;
    }),
  };
  return {
    svc: new FieldService(prisma as any, new ScopeService(), cache as any),
    tx,
    cache,
    get created() { return created; },
    get transactionCommitted() { return transactionCommitted; },
  };
}

describe('FieldService.create #23', () => {
  it('merchant:强制 ownerId=self', async () => {
    const h = make();
    await h.svc.create(merchant, dto);
    expect(h.created.data.ownerId).toBe('m1');
  });
  it('sysadmin:目标 owner 命中则采纳 dto.ownerId', async () => {
    const h = make(true);
    await h.svc.create(sysadmin, dto);
    expect(h.created.data.ownerId).toBe('someoneElse');
  });
  it('sysadmin:目标 owner 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.create(sysadmin, dto)).rejects.toThrow();
    expect(h.created).toBeUndefined();
  });

  it('rolls back the field when coordinate persistence fails', async () => {
    const h = make(true, { coordinateWriteError: new Error('postgis unavailable') });

    await expect(h.svc.create(merchant, dto)).rejects.toThrow('postgis unavailable');

    expect(h.transactionCommitted).toBe(false);
    expect((h.svc as any).prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.cache.invalidateTenant).not.toHaveBeenCalled();
  });

  it('returns the final field view with persisted coordinates', async () => {
    const h = make();

    await expect(h.svc.create(merchant, dto)).resolves.toMatchObject({
      id: 'f1',
      ownerName: '张三农场',
      lng: 100,
      lat: 25,
    });
  });
});

describe('FieldService.list', () => {
  function makeList(overrides: any = {}) {
    let findManyArgs: any;
    let countArgs: any;
    let coordIds: string[] | undefined;
    let coordSql: string | undefined;
    const ownerFindMany = vi.fn().mockResolvedValue(overrides.owners ?? [{ id: 'm1', displayName: '张三农场' }]);
    const fields = overrides.fields ?? [
      {
        id: 'f1',
        tenantId: 't1',
        ownerId: 'm1',
        name: 'A区',
        area: 10,
        iotDeviceId: null,
        createdAt: new Date('2026-06-14T10:00:00.000Z'),
      },
    ];
    const prisma = {
      field: {
        findMany: async (args: any) => { findManyArgs = args; return fields; },
        count: async (args: any) => { countArgs = args; return overrides.total ?? fields.length; },
      },
      user: {
        findMany: ownerFindMany,
      },
      $queryRawUnsafe: async (_sql: string, ids: string[]) => {
        coordSql = _sql;
        coordIds = ids;
        return overrides.coords ?? [{ id: 'f1', lng: 100.1, lat: 25.2 }];
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return {
      svc: new FieldService(prisma as any, new ScopeService()),
      get findManyArgs() { return findManyArgs; },
      get countArgs() { return countArgs; },
      get coordIds() { return coordIds; },
      get coordSql() { return coordSql; },
      ownerFindMany,
    };
  }

  it('unpaginated list applies owned scope, default cap, and enrichment', async () => {
    const h = makeList();

    const result: any[] = await h.svc.list(merchant) as any[];

    expect(h.findManyArgs).toMatchObject({
      where: { tenantId: 't1', ownerId: 'm1' },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    expect(result[0]).toMatchObject({ ownerName: '张三农场', lng: 100.1, lat: 25.2 });
    expect(h.coordIds).toEqual(['f1']);
    expect(h.coordSql).toBe('SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id::text = ANY($1)');
  });

  it('paginated list returns pagination envelope and skip/take', async () => {
    const h = makeList({ total: 21 });

    const result = await h.svc.list(merchant, { page: 3, pageSize: 10 });

    expect(h.findManyArgs.skip).toBe(20);
    expect(h.findManyArgs.take).toBe(10);
    expect(h.countArgs.where).toEqual({ tenantId: 't1', ownerId: 'm1' });
    expect(result).toMatchObject({ total: 21, page: 3, pageSize: 10 });
  });

  it('empty list skips owner and coordinate enrichment queries', async () => {
    const h = makeList({ fields: [] });

    const result = await h.svc.list(merchant);

    expect(result).toEqual([]);
    expect(h.ownerFindMany).not.toHaveBeenCalled();
    expect(h.coordIds).toBeUndefined();
  });
});
