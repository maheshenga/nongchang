import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FarmRecordService } from './farm-record.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, FarmRecordSource, type AuthUser } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const BATCH = '11111111-1111-1111-1111-111111111111';
const FIELD = '22222222-2222-2222-2222-222222222222';
const base = { batchId: BATCH, fieldId: FIELD, action: '施肥', recordedAt: '2026-06-14T10:00:00.000Z', source: FarmRecordSource.MINIAPP };

function makeService(overrides: any = {}) {
  let created: any;
  const farmRecord = {
    create: async (a: any) => { created = a; return { id: 'fr1', ...a.data }; },
    aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
  };
  const supplyIssue = { aggregate: async () => ({ _sum: { amount: overrides.quota ?? 0 } }) };
  const prisma = {
    batch: { findFirst: async ({ where }: any = {}) => {
      if (overrides.batchScoped === false) return null;
      if (where?.fieldId && overrides.batchFieldMatches === false) return null;
      return { id: 'b1', ownerId: 'm1', fieldId: FIELD };
    } },
    field: { findFirst: async () => (overrides.fieldScoped === false ? null : { id: 'f1' }) },
    farmRecord,
    supplyIssue,
    supply: { findFirst: async ({ where }: any = {}) => {
      if (overrides.supplyScoped === false) return null;
      if (where?.ownerId && overrides.supplyOwnerMatches === false) return null;
      return { id: 'sup1', ownerId: 'm1' };
    } },
    // 核销路径用事务 + FOR UPDATE 行锁;tx 复用同一组 mock 表。
    $queryRaw: async () => [{ id: 'sup1' }],
    $transaction: async (fn: any) => fn({ farmRecord, supplyIssue, $queryRaw: async () => [{ id: 'sup1' }] }),
  };
  return { svc: new FarmRecordService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('FarmRecordService.create 核销', () => {
  it('无 supplyId:走原路径,不校验配额', async () => {
    const h = makeService();
    const r = await h.svc.create(merchant, { ...base });
    expect(r.id).toBe('fr1');
    expect(h.created.data.supplyId).toBeUndefined();
  });
  it('带 supplyId 且未超配额110%:落两列', async () => {
    const h = makeService({ quota: 100, consumed: 0 });
    await h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 });
    expect(h.created.data.supplyId).toBe('sup1');
    expect(h.created.data.supplyAmount).toBe(50);
  });
  it('恰好等于配额110%:通过', async () => {
    const h = makeService({ quota: 100, consumed: 60 });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 })).resolves.toBeDefined();
  });
  it('超过配额110%:抛 BadRequest', async () => {
    const h = makeService({ quota: 100, consumed: 65 });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('supply 不在作用域内:抛 Forbidden', async () => {
    const h = makeService({ quota: 100, consumed: 0, supplyScoped: false });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it('supply 在作用域内但不属于 batch owner 时拒绝核销', async () => {
    const h = makeService({ quota: 100, consumed: 0, supplyOwnerMatches: false });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
  });
  it('batch 不在作用域内:抛 Forbidden(不创建)', async () => {
    const h = makeService({ batchScoped: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
  });
  it('field 不在作用域内:抛 Forbidden(不创建)', async () => {
    const h = makeService({ fieldScoped: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
  });
  it('field 在作用域内但不属于 batch 时拒绝创建', async () => {
    const h = makeService({ batchFieldMatches: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
  });
  it('带 supply 核销时在事务内先锁 batch 再锁 supply,避免与批次删除死锁', async () => {
    const calls: string[] = [];
    const h = makeService({ quota: 100, consumed: 0 });
    (h.svc as any).prisma.$transaction = async (fn: any) => fn({
      $queryRaw: async (strings: TemplateStringsArray) => {
        const sql = String(strings[0]);
        calls.push(sql.includes('batches') ? 'lock-batch' : 'lock-supply');
        return [{ id: sql.includes('batches') ? BATCH : 'sup1' }];
      },
      supplyIssue: { aggregate: async () => ({ _sum: { amount: 100 } }) },
      farmRecord: {
        aggregate: async () => ({ _sum: { supplyAmount: 0 } }),
        create: async (a: any) => { calls.push('create-record'); return { id: 'fr1', ...a.data }; },
      },
    });

    await h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 });

    expect(calls).toEqual(['lock-batch', 'lock-supply', 'create-record']);
  });
});

describe('FarmRecordService.list 分页/过滤/排序', () => {
  function makeListService(overrides: any = {}) {
    let findManyArgs: any;
    let countArgs: any;
    const batchFindMany = vi.fn(async () => overrides.batches ?? []);
    const userFindMany = vi.fn(async ({ where }: any) => {
      const ids = where?.id?.in ?? [];
      return (overrides.users ?? []).filter((user: { id: string }) => ids.includes(user.id));
    });
    const prisma = {
      batch: {
        findFirst: async () => (overrides.batchScoped === false ? null : { id: 'b1' }),
        findMany: batchFindMany,
      },
      user: { findMany: userFindMany },
      farmRecord: {
        findMany: async (a: any) => {
          findManyArgs = a;
          return overrides.rows ?? [{ id: 'fr1', batchId: 'b1', operatorId: 'op1', supplyAmount: null }];
        },
        count: async (a: any) => { countArgs = a; return overrides.total ?? 1; },
      },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return {
      svc: new FarmRecordService(prisma as any, new ScopeService()),
      get findManyArgs() { return findManyArgs; },
      get countArgs() { return countArgs; },
      batchFindMany,
      userFindMany,
    };
  }

  it('默认查询:作用域内全部批次,按 recordedAt desc,skip/take 默认分页', async () => {
    const h = makeListService();
    const r = await h.svc.list(merchant, { page: 1, pageSize: 20 });
    expect(r).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(r.items).toHaveLength(1);
    expect(h.findManyArgs.where.batch).toEqual({
      is: { tenantId: 't1', ownerId: 'm1' },
    });
    expect(h.batchFindMany).toHaveBeenCalledTimes(1);
    expect(h.findManyArgs.orderBy).toEqual({ recordedAt: 'desc' });
    expect(h.findManyArgs.skip).toBe(0);
    expect(h.findManyArgs.take).toBe(20);
  });

  it('分页第2页:skip=(page-1)*pageSize', async () => {
    const h = makeListService();
    await h.svc.list(merchant, { page: 3, pageSize: 10 });
    expect(h.findManyArgs.skip).toBe(20);
    expect(h.findManyArgs.take).toBe(10);
  });

  it('指定 batchId:校验归属后精确过滤该批次', async () => {
    const h = makeListService();
    await h.svc.list(merchant, { batchId: BATCH, page: 1, pageSize: 20 });
    expect(h.findManyArgs.where.batchId).toBe(BATCH);
  });

  it('指定 batchId 不在作用域内:抛 Forbidden(不查列表)', async () => {
    const h = makeListService({ batchScoped: false });
    await expect(h.svc.list(merchant, { batchId: BATCH, page: 1, pageSize: 20 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(h.findManyArgs).toBeUndefined();
  });

  it('返回归属商户与执行人的友好名称', async () => {
    const h = makeListService({
      rows: [{ id: 'fr1', batchId: 'b1', operatorId: 'op1', supplyAmount: null }],
      batches: [{ id: 'b1', ownerId: 'm1' }],
      users: [
        { id: 'm1', displayName: 'Merchant A' },
        { id: 'op1', displayName: 'Operator A' },
      ],
    });

    const result = await h.svc.list(merchant, { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({ ownerName: 'Merchant A', operatorName: 'Operator A' });
    expect(h.userFindMany).toHaveBeenCalledTimes(2);
  });
});
