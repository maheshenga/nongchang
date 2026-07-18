import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FarmRecordService } from './farm-record.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, FarmRecordSource, type AuthUser } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const BATCH = '11111111-1111-1111-1111-111111111111';
const FIELD = '22222222-2222-2222-2222-222222222222';
const base = { batchId: BATCH, fieldId: FIELD, action: '施肥', recordedAt: '2026-06-14T10:00:00.000Z', source: FarmRecordSource.MINIAPP };

function expectTenantQualifiedLock(call: any[], table: string, id: string) {
  const [strings, lockedId, tenantId] = call;
  const sql = strings.join('?');
  expect(sql).toContain(`FROM ${table}`);
  expect(sql).toContain('tenant_id');
  expect(sql).toContain('FOR UPDATE');
  expect(lockedId).toBe(id);
  expect(tenantId).toBe(merchant.tenantId);
}

function makeService(overrides: any = {}) {
  const calls: string[] = [];
  let rootCreated: any;
  let txCreated: any;
  let rootPublished: any;
  let txPublished: any;
  let rootFarmRecordCreateCount = 0;
  let txFarmRecordCreateCount = 0;
  let rootTraceEventCreateCount = 0;
  let txTraceEventCreateCount = 0;
  let transactionError: unknown;
  const batch = {
    id: BATCH,
    tenantId: overrides.batchTenantMatches === false ? 't2' : 't1',
    ownerId: 'm1',
    fieldId: overrides.batchFieldMatches === false ? '44444444-4444-4444-4444-444444444444' : FIELD,
  };
  const field = {
    id: FIELD,
    tenantId: overrides.fieldTenantMatches === false ? 't2' : 't1',
    ownerId: overrides.fieldOwnerMatches === false ? 'm2' : 'm1',
    name: '一号地块',
  };
  const owner = {
    id: 'm1',
    tenantId: overrides.ownerTenantMatches === false ? 't2' : 't1',
    displayName: '示范农场',
  };
  const supply = {
    id: 'sup1',
    tenantId: overrides.supplyTenantMatches === false ? 't2' : 't1',
    ownerId: overrides.supplyOwnerMatches === false ? 'm2' : 'm1',
  };
  const rootFarmRecord = {
    create: async (a: any) => {
      rootFarmRecordCreateCount += 1;
      rootCreated = a;
      return { id: 'fr1', ...a.data };
    },
    aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
  };
  const txFarmRecord = {
    create: async (a: any) => {
      calls.push('create-record');
      txFarmRecordCreateCount += 1;
      txCreated = a;
      return { id: 'fr1', ...a.data };
    },
    aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
  };
  const rootTraceEvent = {
    create: async (a: any) => {
      rootTraceEventCreateCount += 1;
      rootPublished = a;
      return { id: 'root-te1', ...a.data };
    },
  };
  const txTraceEvent = {
    create: async (a: any) => {
      calls.push('publish-event');
      txTraceEventCreateCount += 1;
      if (overrides.publishError) throw new Error('publish failed');
      txPublished = a;
      return { id: 'te1', ...a.data };
    },
  };
  const supplyIssue = { aggregate: async () => ({ _sum: { amount: overrides.quota ?? 0 } }) };
  let txBatchReadCount = 0;
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('FROM batches')) {
        calls.push('lock-batch');
        return overrides.batchTenantMatches === false ? [] : [{ id: BATCH }];
      }
      if (sql.includes('FROM fields')) {
        calls.push('lock-field');
        return overrides.fieldTenantMatches === false ? [] : [{ id: FIELD }];
      }
      if (sql.includes('FROM users')) {
        calls.push('lock-owner');
        return overrides.ownerTenantMatches === false ? [] : [{ id: owner.id }];
      }
      if (sql.includes('FROM supplies')) {
        calls.push('lock-supply');
        return overrides.supplyTenantMatches === false ? [] : [{ id: supply.id }];
      }
      throw new Error(`unexpected lock SQL: ${sql}`);
    }),
    batch: {
      findFirst: vi.fn(async () => {
        calls.push(txBatchReadCount++ === 0 ? 'read-batch-candidate' : 'reload-context');
        if (overrides.batchScoped === false) return null;
        return txBatchReadCount === 1 ? batch : { ...batch, owner, field };
      }),
    },
    field: { findFirst: vi.fn(async () => field) },
    user: { findFirst: vi.fn(async () => owner) },
    supply: {
      findFirst: vi.fn(async () => {
        calls.push('reload-supply');
        return overrides.supplyScoped === false ? null : supply;
      }),
    },
    farmRecord: txFarmRecord,
    traceEvent: txTraceEvent,
    supplyIssue,
  };
  const transaction = vi.fn(async (fn: any) => {
    try {
      return await fn(tx);
    } catch (error) {
      transactionError = error;
      throw error;
    }
  });
  const scope = {
    assertInScope: vi.fn(async (_client: any, _user: AuthUser, entity: 'batch' | 'field') => {
      if (entity === 'batch' && overrides.batchScoped === false) throw new ForbiddenException('batch out of scope');
      if (entity === 'field' && overrides.fieldScoped === false) throw new ForbiddenException('field out of scope');
    }),
    ownedEntityWhere: vi.fn(() => ({ tenantId: 't1', ownerId: 'm1' })),
  };
  const prisma = {
    batch: { findFirst: async ({ where }: any = {}) => {
      if (overrides.batchScoped === false) return null;
      if (where?.fieldId && overrides.batchFieldMatches === false) return null;
      return {
        ...batch,
        owner,
        field,
      };
    } },
    field: { findFirst: async () => (overrides.fieldScoped === false ? null : field) },
    farmRecord: rootFarmRecord,
    traceEvent: rootTraceEvent,
    supplyIssue,
    supply: { findFirst: async () => (overrides.supplyScoped === false ? null : supply) },
    $transaction: transaction,
  };
  const cache = {
    invalidateBatch: vi.fn(async () => {
      if (overrides.cacheError) throw new Error('cache unavailable');
    }),
  };
  return {
    svc: new FarmRecordService(prisma as any, scope as any, cache as any),
    tx,
    transaction,
    scopeAssertInScope: scope.assertInScope,
    scopeOwnedEntityWhere: scope.ownedEntityWhere,
    cacheInvalidateBatch: cache.invalidateBatch,
    calls,
    get created() { return txCreated ?? rootCreated; },
    get published() { return txPublished ?? rootPublished; },
    get rootFarmRecordCreateCount() { return rootFarmRecordCreateCount; },
    get txFarmRecordCreateCount() { return txFarmRecordCreateCount; },
    get rootTraceEventCreateCount() { return rootTraceEventCreateCount; },
    get txTraceEventCreateCount() { return txTraceEventCreateCount; },
    get transactionError() { return transactionError; },
  };
}

function makeStatusService(overrides: {
  status?: 'pending' | 'completed';
  publishError?: boolean;
  recordTenantMatches?: boolean;
  recordBatchMatches?: boolean;
  batchTenantMatches?: boolean;
  recordFieldMatchesBatch?: boolean;
  fieldTenantMatches?: boolean;
  fieldOwnerMatchesBatch?: boolean;
  batchOwnerTenantMatches?: boolean;
  cacheError?: boolean;
} = {}) {
  const calls: string[] = [];
  let transactionError: unknown;
  const recordBatchId = overrides.recordBatchMatches === false
    ? '33333333-3333-3333-3333-333333333333'
    : BATCH;
  const batchFieldId = overrides.recordFieldMatchesBatch === false
    ? '44444444-4444-4444-4444-444444444444'
    : FIELD;
  const recordScalars = {
    id: 'fr-status',
    tenantId: overrides.recordTenantMatches === false ? 't2' : 't1',
    batchId: recordBatchId,
    fieldId: FIELD,
    operatorId: 'u1',
    action: '除草',
    detail: { desc: '完成除草' },
    images: null,
    location: null,
    recordedAt: new Date('2026-07-17T01:02:03.000Z'),
    source: 'web',
    status: overrides.status ?? 'pending',
    supplyId: null,
    supplyAmount: null,
    createdAt: new Date('2026-07-17T01:02:03.000Z'),
  };
  const current = {
    ...recordScalars,
    batch: {
      id: recordBatchId,
      tenantId: overrides.batchTenantMatches === false ? 't2' : 't1',
      ownerId: 'm1',
      fieldId: batchFieldId,
      owner: {
        id: 'm1',
        tenantId: overrides.batchOwnerTenantMatches === false ? 't2' : 't1',
        displayName: '示范农场',
      },
    },
    field: {
      id: FIELD,
      tenantId: overrides.fieldTenantMatches === false ? 't2' : 't1',
      ownerId: overrides.fieldOwnerMatchesBatch === false ? 'm2' : 'm1',
      name: '一号地块',
    },
  };
  const traceEventCreate = vi.fn(async (_args: any) => {
    calls.push('publish-event');
    if (overrides.publishError) throw new Error('publish failed');
    return { id: 'te-status' };
  });
  const farmRecordUpdate = vi.fn(async (args: any) => {
    calls.push('update-record');
    return { ...recordScalars, status: args.data.status };
  });
  const rootFarmRecordUpdate = vi.fn(async (args: any) => ({ ...recordScalars, status: args.data.status }));
  let contextReadCount = 0;
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, lockedId: string) => {
      const sql = strings.join('?');
      if (sql.includes('FROM batches')) {
        calls.push('lock-batch');
        return [{ id: BATCH }];
      }
      if (sql.includes('FROM fields')) {
        calls.push('lock-field');
        return [{ id: FIELD }];
      }
      if (sql.includes('FROM users')) {
        calls.push('lock-owner');
        return [{ id: 'm1' }];
      }
      calls.push('lock-record');
      return [{ id: lockedId }];
    }),
    batch: {
      findFirst: vi.fn(async () => {
        calls.push(contextReadCount++ === 0 ? 'read-batch-candidate' : 'reload-context');
        return contextReadCount === 1
          ? { id: BATCH, tenantId: current.batch.tenantId, ownerId: current.batch.ownerId, fieldId: current.batch.fieldId }
          : { ...current.batch, field: current.field };
      }),
    },
    field: { findFirst: vi.fn(async () => ({ id: FIELD })) },
    farmRecord: {
      findFirst: vi.fn(async () => {
        calls.push('read-record');
        return current;
      }),
      update: farmRecordUpdate,
    },
    traceEvent: { create: traceEventCreate },
  };
  const transaction = vi.fn(async (fn: any) => {
    try {
      return await fn(tx);
    } catch (error) {
      transactionError = error;
      throw error;
    }
  });
  const prisma = {
    farmRecord: {
      findFirst: vi.fn(async () => ({ id: current.id, batchId: BATCH })),
      update: rootFarmRecordUpdate,
    },
    $transaction: transaction,
  };
  const scope = {
    assertInScope: vi.fn(async () => undefined),
  };
  const cache = {
    invalidateBatch: vi.fn(async () => {
      if (overrides.cacheError) throw new Error('cache unavailable');
    }),
  };
  return {
    svc: new FarmRecordService(prisma as any, scope as any, cache as any),
    tx,
    transaction,
    scopeAssertInScope: scope.assertInScope,
    traceEventCreate,
    farmRecordUpdate,
    rootFarmRecordUpdate,
    cacheInvalidateBatch: cache.invalidateBatch,
    calls,
    get transactionError() { return transactionError; },
  };
}

describe('FarmRecordService.updateStatus 自动发布', () => {
  it('keeps a committed completion successful when cache invalidation fails', async () => {
    const h = makeStatusService({ status: 'pending', cacheError: true });

    await expect(h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' }))
      .resolves.toMatchObject({ status: 'completed' });
    expect(h.farmRecordUpdate).toHaveBeenCalledTimes(1);
    expect(h.traceEventCreate).toHaveBeenCalledTimes(1);
  });

  it('pending to completed locks, updates, publishes once, and returns scalars', async () => {
    const h = makeStatusService({ status: 'pending' });

    const result = await h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' });

    expect(result.status).toBe('completed');
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.$queryRaw).toHaveBeenCalledTimes(4);
    const [batchLockStrings, batchLockId] = h.tx.$queryRaw.mock.calls[0];
    expect(batchLockStrings.join('?')).toContain('FROM batches');
    expect(batchLockStrings.join('?')).toContain('FOR UPDATE');
    expect(batchLockStrings.join('?')).toContain('tenant_id');
    expect(batchLockId).toBe(BATCH);
    expect(h.tx.$queryRaw.mock.calls[0][2]).toBe(merchant.tenantId);
    const [recordLockStrings, recordLockId] = h.tx.$queryRaw.mock.calls[1];
    expect(recordLockStrings.join('?')).toContain('FROM farm_records');
    expect(recordLockStrings.join('?')).toContain('FOR UPDATE');
    expect(recordLockStrings.join('?')).toContain('tenant_id');
    expect(recordLockId).toBe('fr-status');
    expect(h.tx.$queryRaw.mock.calls[1][2]).toBe(merchant.tenantId);
    expectTenantQualifiedLock(h.tx.$queryRaw.mock.calls[2], 'fields', FIELD);
    expectTenantQualifiedLock(h.tx.$queryRaw.mock.calls[3], 'users', 'm1');
    expect(h.scopeAssertInScope).toHaveBeenNthCalledWith(1, h.tx, merchant, 'batch', BATCH);
    expect(h.scopeAssertInScope).toHaveBeenNthCalledWith(2, h.tx, merchant, 'field', FIELD);
    expect(h.farmRecordUpdate).toHaveBeenCalledTimes(1);
    expect(h.traceEventCreate).toHaveBeenCalledTimes(1);
    expect(h.cacheInvalidateBatch).toHaveBeenCalledWith(BATCH);
    expect(h.traceEventCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      batchId: BATCH,
      title: '除草',
      actor: '示范农场',
      location: '一号地块',
      sourceFarmRecordId: 'fr-status',
    });
    expect(h.rootFarmRecordUpdate).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'lock-batch', 'lock-record', 'read-record', 'read-batch-candidate', 'lock-field', 'lock-owner',
      'reload-context', 'update-record', 'publish-event',
    ]);
    expect(result).not.toHaveProperty('batch');
    expect(result).not.toHaveProperty('field');
  });

  it('repeated completed is an idempotent no-op', async () => {
    const h = makeStatusService({ status: 'completed' });

    const result = await h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' });

    expect(result.status).toBe('completed');
    expect(h.tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(h.farmRecordUpdate).not.toHaveBeenCalled();
    expect(h.traceEventCreate).not.toHaveBeenCalled();
    expect(h.rootFarmRecordUpdate).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'lock-batch', 'lock-record', 'read-record', 'read-batch-candidate', 'lock-field', 'lock-owner', 'reload-context',
    ]);
    expect(result).not.toHaveProperty('batch');
    expect(result).not.toHaveProperty('field');
  });

  it('completed to pending is rejected without writes', async () => {
    const h = makeStatusService({ status: 'completed' });

    await expect(h.svc.updateStatus(merchant, 'fr-status', { status: 'pending' }))
      .rejects.toThrow('已完成农事记录不可退回待完成');

    expect(h.farmRecordUpdate).not.toHaveBeenCalled();
    expect(h.traceEventCreate).not.toHaveBeenCalled();
    expect(h.rootFarmRecordUpdate).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'lock-batch', 'lock-record', 'read-record', 'read-batch-candidate', 'lock-field', 'lock-owner', 'reload-context',
    ]);
    expect(h.transactionError).toBeInstanceOf(BadRequestException);
  });

  it('pending to pending remains a private no-op', async () => {
    const h = makeStatusService({ status: 'pending' });

    const result = await h.svc.updateStatus(merchant, 'fr-status', { status: 'pending' });

    expect(result.status).toBe('pending');
    expect(h.farmRecordUpdate).not.toHaveBeenCalled();
    expect(h.traceEventCreate).not.toHaveBeenCalled();
    expect(h.rootFarmRecordUpdate).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'lock-batch', 'lock-record', 'read-record', 'read-batch-candidate', 'lock-field', 'lock-owner', 'reload-context',
    ]);
    expect(result).not.toHaveProperty('batch');
    expect(result).not.toHaveProperty('field');
  });

  it('publication failure escapes the transaction after the completion write', async () => {
    const h = makeStatusService({ status: 'pending', publishError: true });

    await expect(h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' }))
      .rejects.toThrow('publish failed');

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.farmRecordUpdate).toHaveBeenCalledTimes(1);
    expect(h.traceEventCreate).toHaveBeenCalledTimes(1);
    expect(h.rootFarmRecordUpdate).not.toHaveBeenCalled();
    expect(h.calls).toEqual([
      'lock-batch', 'lock-record', 'read-record', 'read-batch-candidate', 'lock-field', 'lock-owner',
      'reload-context', 'update-record', 'publish-event',
    ]);
    expect(h.transactionError).toEqual(new Error('publish failed'));
  });

  it.each([
    ['record tenant', { recordTenantMatches: false }],
    ['record batch', { recordBatchMatches: false }],
    ['batch tenant', { batchTenantMatches: false }],
    ['record field and batch field', { recordFieldMatchesBatch: false }],
    ['field tenant', { fieldTenantMatches: false }],
    ['field owner and batch owner', { fieldOwnerMatchesBatch: false }],
    ['batch owner tenant', { batchOwnerTenantMatches: false }],
  ])('fails closed when %s context is inconsistent', async (_label, mismatch) => {
    const h = makeStatusService({ status: 'pending', ...mismatch });

    await expect(h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' }))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(h.farmRecordUpdate).not.toHaveBeenCalled();
    expect(h.traceEventCreate).not.toHaveBeenCalled();
    expect(h.rootFarmRecordUpdate).not.toHaveBeenCalled();
    expect(h.calls.slice(0, 3)).toEqual(['lock-batch', 'lock-record', 'read-record']);
  });
});

describe('FarmRecordService.create 核销', () => {
  it('keeps a committed create successful when cache invalidation fails', async () => {
    const h = makeService({ cacheError: true });

    await expect(h.svc.create(merchant, {
      ...base,
      detail: { note: 'cache failure create' },
      source: FarmRecordSource.MINIAPP,
    })).resolves.toMatchObject({ status: 'completed' });
    expect(h.txFarmRecordCreateCount).toBe(1);
    expect(h.txTraceEventCreateCount).toBe(1);
  });

  it('completed non-quota create uses only transaction delegates to publish one linked event', async () => {
    const h = makeService();

    const result = await h.svc.create(merchant, {
      batchId: BATCH,
      fieldId: FIELD,
      action: '施肥',
      detail: { note: '完成追肥', cost: 200 },
      images: ['https://cdn.example/1.jpg'],
      recordedAt: '2026-07-17T01:02:03.000Z',
      source: FarmRecordSource.MINIAPP,
    });

    expect(result.status).toBe('completed');
    expect(h.txFarmRecordCreateCount).toBe(1);
    expect(h.txTraceEventCreateCount).toBe(1);
    expect(h.cacheInvalidateBatch).toHaveBeenCalledWith(BATCH);
    expect(h.rootFarmRecordCreateCount).toBe(0);
    expect(h.rootTraceEventCreateCount).toBe(0);
    expect(h.published.data.sourceFarmRecordId).toBe('fr1');
    expect(h.published.data.payload).toEqual({ desc: '完成追肥', image: 'https://cdn.example/1.jpg' });
    expect(h.calls).toEqual([
      'lock-batch', 'read-batch-candidate', 'lock-field', 'lock-owner', 'reload-context',
      'create-record', 'publish-event',
    ]);
    expectTenantQualifiedLock(h.tx.$queryRaw.mock.calls[0], 'batches', BATCH);
    expectTenantQualifiedLock(h.tx.$queryRaw.mock.calls[1], 'fields', FIELD);
    expectTenantQualifiedLock(h.tx.$queryRaw.mock.calls[2], 'users', 'm1');
    expect(h.scopeAssertInScope).toHaveBeenNthCalledWith(1, h.tx, merchant, 'batch', BATCH);
    expect(h.scopeAssertInScope).toHaveBeenNthCalledWith(2, h.tx, merchant, 'field', FIELD);
  });

  it('completed quota create publishes through the transaction event delegate', async () => {
    const h = makeService({ quota: 100 });

    await h.svc.create(merchant, {
      batchId: BATCH,
      fieldId: FIELD,
      action: '施肥',
      recordedAt: '2026-07-17T01:02:03.000Z',
      source: FarmRecordSource.MINIAPP,
      supplyId: '11111111-1111-4111-8111-111111111111',
      supplyAmount: 10,
    });

    expect(h.txFarmRecordCreateCount).toBe(1);
    expect(h.txTraceEventCreateCount).toBe(1);
    expect(h.rootFarmRecordCreateCount).toBe(0);
    expect(h.rootTraceEventCreateCount).toBe(0);
    expect(h.published.data.sourceFarmRecordId).toBe('fr1');
    expect(h.calls).toEqual([
      'lock-batch', 'read-batch-candidate', 'lock-field', 'lock-owner', 'reload-context',
      'lock-supply', 'reload-supply', 'create-record', 'publish-event',
    ]);
    expectTenantQualifiedLock(h.tx.$queryRaw.mock.calls[3], 'supplies', '11111111-1111-4111-8111-111111111111');
    expect(h.scopeOwnedEntityWhere).toHaveBeenCalledWith(merchant);
  });

  it('pending create remains private while using the transaction record delegate', async () => {
    const h = makeService();

    await h.svc.create(merchant, {
      batchId: BATCH,
      fieldId: FIELD,
      action: '除草',
      recordedAt: '2026-07-17T01:02:03.000Z',
      source: FarmRecordSource.WEB,
      status: 'pending',
    });

    expect(h.txFarmRecordCreateCount).toBe(1);
    expect(h.txTraceEventCreateCount).toBe(0);
    expect(h.rootFarmRecordCreateCount).toBe(0);
    expect(h.rootTraceEventCreateCount).toBe(0);
    expect(h.published).toBeUndefined();
    expect(h.calls).toEqual([
      'lock-batch', 'read-batch-candidate', 'lock-field', 'lock-owner', 'reload-context',
      'create-record',
    ]);
  });

  it('propagates a completed projection failure out of the transaction', async () => {
    const h = makeService({ publishError: true });

    await expect(h.svc.create(merchant, {
      batchId: BATCH,
      fieldId: FIELD,
      action: '施肥',
      recordedAt: '2026-07-17T01:02:03.000Z',
      source: FarmRecordSource.MINIAPP,
    })).rejects.toThrow('publish failed');

    expect(h.txFarmRecordCreateCount).toBe(1);
    expect(h.txTraceEventCreateCount).toBe(1);
    expect(h.rootFarmRecordCreateCount).toBe(0);
    expect(h.rootTraceEventCreateCount).toBe(0);
    expect(h.transactionError).toBeInstanceOf(Error);
  });

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
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.created).toBeUndefined();
  });
  it('supply 在作用域内但不属于 batch owner 时拒绝核销', async () => {
    const h = makeService({ quota: 100, consumed: 0, supplyOwnerMatches: false });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
    expect(h.published).toBeUndefined();
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.calls).toContain('lock-supply');
    expect(h.calls).toContain('reload-supply');
  });
  it('supply tenant drift after locking is rejected before quota reads or writes', async () => {
    const h = makeService({ quota: 100, consumed: 0, supplyTenantMatches: false });

    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.calls).toContain('lock-supply');
    expect(h.calls).not.toContain('create-record');
    expect(h.calls).not.toContain('publish-event');
  });
  it('batch 不在作用域内:抛 Forbidden(不创建)', async () => {
    const h = makeService({ batchScoped: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });
  it('field 不在作用域内:抛 Forbidden(不创建)', async () => {
    const h = makeService({ fieldScoped: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });
  it('field 在作用域内但不属于 batch 时拒绝创建', async () => {
    const h = makeService({ batchFieldMatches: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['batch tenant', { batchTenantMatches: false }],
    ['batch field', { batchFieldMatches: false }],
    ['field tenant', { fieldTenantMatches: false }],
    ['field owner', { fieldOwnerMatches: false }],
    ['owner tenant', { ownerTenantMatches: false }],
  ])('rejects %s drift inside the transaction before record or event writes', async (_label, drift) => {
    const h = makeService(drift);

    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.calls).not.toContain('create-record');
    expect(h.calls).not.toContain('publish-event');
  });
});

describe('FarmRecordService.list 分页/过滤/排序', () => {
  function makeListService(overrides: any = {}) {
    let findManyArgs: any;
    let countArgs: any;
    const batchFindMany = vi.fn(async () => []);
    const prisma = {
      batch: {
        findFirst: async () => (overrides.batchScoped === false ? null : { id: 'b1' }),
        findMany: batchFindMany,
      },
      user: { findMany: async () => [] },
      farmRecord: {
        findMany: async (a: any) => { findManyArgs = a; return overrides.rows ?? [{ id: 'fr1', batchId: 'b1' }]; },
        count: async (a: any) => { countArgs = a; return overrides.total ?? 1; },
      },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return {
      svc: new FarmRecordService(prisma as any, new ScopeService()),
      get findManyArgs() { return findManyArgs; },
      get countArgs() { return countArgs; },
      batchFindMany,
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
});
