import { describe, expect, it } from 'vitest';
import { meProfileViewSchema } from './auth.dto';
import { closeAccountSchema } from './account-lifecycle.dto';

describe('account lifecycle contracts', () => {
  it('accepts password reauthentication with the exact destructive confirmation', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'closeAccountSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;

    expect(schema).toBeDefined();
    expect(schema?.parse({
      method: 'password',
      currentPassword: 'password123',
      confirmation: '注销账号',
    })).toEqual({
      method: 'password',
      currentPassword: 'password123',
      confirmation: '注销账号',
    });
  });

  it('rejects any destructive confirmation other than 注销账号', () => {
    expect(() => closeAccountSchema.parse({
      method: 'password',
      currentPassword: 'password123',
      confirmation: '确认',
    })).toThrow();
  });

  it('accepts fresh WeChat reauthentication', () => {
    expect(closeAccountSchema.parse({
      method: 'wechat',
      appId: 'wx-example',
      code: 'fresh-code',
      confirmation: '注销账号',
    })).toEqual({
      method: 'wechat',
      appId: 'wx-example',
      code: 'fresh-code',
      confirmation: '注销账号',
    });
  });

  it('exposes only the account deletion verification method', () => {
    const profile = meProfileViewSchema.parse({
      id: 'u1',
      tenantId: 't1',
      username: 'merchantA',
      role: 'merchant',
      agentId: null,
      displayName: '示例基地',
      phone: null,
      status: 'active',
      deletionVerification: 'wechat',
    });

    expect(profile.deletionVerification).toBe('wechat');
    expect(profile).not.toHaveProperty('wxOpenid');
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('requires a publication ID on password miniapp login', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'miniappLoginSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const input = {
      tenantCode: 'DEMO',
      username: 'merchantA',
      password: 'password123',
      publicationId: '22222222-2222-4222-8222-222222222222',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(input)).toEqual(input);
    expect(() => schema?.parse({
      tenantCode: 'DEMO',
      username: 'merchantA',
      password: 'password123',
    })).toThrow();
  });

  it('requires a publication ID on WeChat miniapp login', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'miniappWechatLoginSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const input = {
      appId: 'wx-example',
      code: 'fresh-code',
      publicationId: '22222222-2222-4222-8222-222222222222',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(input)).toEqual(input);
  });

  it('requires a publication ID on WeChat miniapp registration', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'miniappWechatRegisterSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const input = {
      appId: 'wx-example',
      code: 'fresh-code',
      displayName: '示例用户',
      phone: '13800001111',
      publicationId: '22222222-2222-4222-8222-222222222222',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(input)).toEqual(input);
  });

  it('accepts an empty versioned personal-data export envelope', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountDataExportSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const input = {
      schemaVersion: 1,
      generatedAt: '2026-07-14T10:00:00.000Z',
      tenant: { id: 't1', code: 'DEMO', name: '示例租户' },
      account: {
        id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
        displayName: '示例基地', phone: null, status: 'active', deletionVerification: 'password',
      },
      data: {
        fields: [],
        batches: [],
        farmRecords: [],
        supplies: [],
        supplyIssues: [],
        uploads: [],
        aiOperations: [],
        creditOrders: [],
        creditAccount: null,
      },
      exclusions: ['不包含密码、令牌、OpenID、第三方密钥和其他用户资料。'],
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(input)).toEqual(input);
  });

  it('accepts safe owned-field metadata in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountFieldSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const field = {
      id: 'field-1',
      name: '东区一号田',
      area: 12.5,
      createdAt: '2026-07-14T10:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(field)).toEqual(field);
  });

  it('accepts safe owned-batch metadata in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountBatchSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const batch = {
      id: 'batch-1', batchNo: 'B-001', cropName: '番茄', status: 'Growing',
      plantDate: '2026-01-01T00:00:00.000Z',
      expectedHarvest: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(batch)).toEqual(batch);
  });

  it('accepts safe operator farm-record metadata in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountFarmRecordSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const record = {
      id: 'record-1', batchId: 'batch-1', fieldId: 'field-1', action: '浇水',
      detail: { note: '少量' }, images: ['https://cdn.example.com/a.jpg'], location: null,
      recordedAt: '2026-07-14T10:00:00.000Z', source: 'miniapp', status: 'completed',
      createdAt: '2026-07-14T10:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(record)).toEqual(record);
  });

  it('accepts safe owned-supply metadata in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountSupplySchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const supply = {
      id: 'supply-1', name: '有机肥', unit: 'kg', total: 100, used: 25,
      createdAt: '2026-07-14T10:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(supply)).toEqual(supply);
  });

  it('accepts safe owned-supply-issue metadata in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountSupplyIssueSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const issue = {
      id: 'issue-1', supplyId: 'supply-1', batchId: 'batch-1', amount: 3,
      unitPrice: 8.5, createdAt: '2026-07-14T10:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(issue)).toEqual(issue);
  });

  it('accepts upload metadata without internal storage identifiers', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountUploadSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const upload = {
      id: 'upload-1', purpose: 'farm-record', url: 'https://cdn.example.com/a.jpg',
      sizeBytes: '1024', status: 'READY', createdAt: '2026-07-14T10:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(upload)).toEqual(upload);
  });

  it('rejects raw OSS object keys from upload export metadata', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountUploadSchema') as {
      parse(value: unknown): Record<string, unknown>;
    };

    expect(() => schema.parse({
      id: 'upload-1', purpose: 'farm-record', url: null, sizeBytes: '1024',
      status: 'READY', createdAt: '2026-07-14T10:00:00.000Z',
      objectKey: 'tenant/t1/private.jpg',
    })).toThrow();
  });

  it('accepts safe AI-operation metadata without provider results', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountAiOperationSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const operation = {
      id: 'operation-1', kind: 'chat', status: 'COMPLETED', errorCategory: null,
      createdAt: '2026-07-14T10:00:00.000Z', updatedAt: '2026-07-14T10:00:01.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(operation)).toEqual(operation);
  });

  it('rejects provider and result envelopes from AI-operation exports', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountAiOperationSchema') as {
      parse(value: unknown): Record<string, unknown>;
    };

    expect(() => schema.parse({
      id: 'operation-1', kind: 'chat', status: 'COMPLETED', errorCategory: null,
      createdAt: '2026-07-14T10:00:00.000Z', updatedAt: '2026-07-14T10:00:01.000Z',
      providerId: 'provider-secret-link', resultEnvelope: { raw: 'private-result' },
    })).toThrow();
  });

  it('accepts safe buyer credit-order metadata in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountCreditOrderSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const order = {
      id: 'order-1', resource: 'CODE', quantity: 100, amountCents: 9900,
      status: 'PAID', payChannel: 'alipay_wap', paidAt: '2026-07-14T10:00:00.000Z',
      createdAt: '2026-07-14T09:00:00.000Z',
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(order)).toEqual(order);
  });

  it('rejects payment trade numbers from credit-order exports', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountCreditOrderSchema') as {
      parse(value: unknown): Record<string, unknown>;
    };

    expect(() => schema.parse({
      id: 'order-1', resource: 'CODE', quantity: 100, amountCents: 9900,
      status: 'PAID', payChannel: 'alipay_wap', paidAt: '2026-07-14T10:00:00.000Z',
      createdAt: '2026-07-14T09:00:00.000Z', tradeNo: 'private-trade-number',
    })).toThrow();
  });

  it('accepts safe credit balances and ledger entries in an export', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountCreditAccountSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const account = {
      aiBalance: 20,
      codeBalance: 80,
      ledgers: [{
        id: 'ledger-1', resource: 'CODE', delta: 100, balanceAfter: 100,
        reason: 'PURCHASE', note: null, createdAt: '2026-07-14T10:00:00.000Z',
      }],
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(account)).toEqual(account);
  });

  it('rejects internal idempotency keys from ledger exports', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountCreditLedgerSchema') as {
      parse(value: unknown): Record<string, unknown>;
    };

    expect(() => schema.parse({
      id: 'ledger-1', resource: 'CODE', delta: 100, balanceAfter: 100,
      reason: 'PURCHASE', note: null, createdAt: '2026-07-14T10:00:00.000Z',
      idempotencyKey: 'private-key',
    })).toThrow();
  });

  it('accepts a live preview with counts and latest-20 collections', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountDataPreviewSchema') as
      | { parse(value: unknown): Record<string, unknown> }
      | undefined;
    const preview = {
      generatedAt: '2026-07-14T10:00:00.000Z',
      tenant: { id: 't1', code: 'DEMO', name: '示例租户' },
      account: {
        id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
        displayName: '示例基地', phone: null, status: 'active', deletionVerification: 'password',
      },
      counts: {
        fields: 1, batches: 2, farmRecords: 3, supplies: 4, supplyIssues: 5,
        uploads: 6, aiOperations: 7, creditOrders: 8, creditLedgers: 9,
      },
      recent: {
        fields: [], batches: [], farmRecords: [], supplies: [], supplyIssues: [],
        uploads: [], aiOperations: [], creditOrders: [], creditAccount: null,
      },
      recentLimit: 20,
    };

    expect(schema).toBeDefined();
    expect(schema?.parse(preview)).toEqual(preview);
  });

  it('rejects password hashes from the exported account profile', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountDataExportSchema') as {
      parse(value: unknown): Record<string, unknown>;
    };

    expect(() => schema.parse({
      schemaVersion: 1,
      generatedAt: '2026-07-14T10:00:00.000Z',
      tenant: { id: 't1', code: 'DEMO', name: '示例租户' },
      account: {
        id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
        displayName: '示例基地', phone: null, status: 'active', deletionVerification: 'password',
        passwordHash: 'private-password-hash',
      },
      data: {
        fields: [], batches: [], farmRecords: [], supplies: [], supplyIssues: [],
        uploads: [], aiOperations: [], creditOrders: [], creditAccount: null,
      },
      exclusions: ['不包含密码。'],
    })).toThrow();
  });

  it('rejects internal credit-account identifiers from exports', async () => {
    const shared = await import('../index');
    const schema = Reflect.get(shared, 'accountCreditAccountSchema') as {
      parse(value: unknown): Record<string, unknown>;
    };

    expect(() => schema.parse({
      aiBalance: 20,
      codeBalance: 80,
      ledgers: [],
      accountId: 'internal-account-id',
    })).toThrow();
  });
});
