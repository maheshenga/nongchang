import { describe, expect, it } from 'vitest';
import {
  EXPORT_BYTE_LIMIT,
  EXPORT_EXCLUSIONS,
  EXPORT_ROW_LIMIT,
  PREVIEW_LIMIT,
  escapeCsvCell,
  toAccountAiOperation,
  toAccountBatch,
  toAccountCreditAccount,
  toAccountCreditOrder,
  toAccountFarmRecord,
  toAccountField,
  toAccountProfile,
  toAccountSupply,
  toAccountSupplyIssue,
  toAccountUpload,
} from './account-data.model';

const createdAt = new Date('2026-07-14T09:00:00.000Z');

describe('account data safe mapping', () => {
  it('converts dates, decimals, bigint values, and image arrays', () => {
    expect(toAccountField({
      id: 'field-1', name: '一号田', area: 12.5, createdAt, iotDeviceId: 'secret-device',
    })).toEqual({ id: 'field-1', name: '一号田', area: 12.5, createdAt: createdAt.toISOString() });
    expect(toAccountBatch({
      id: 'batch-1', batchNo: 'B001', cropName: '番茄', status: 'active',
      plantDate: createdAt, expectedHarvest: createdAt, createdAt, laborCost: '99.00',
    })).not.toHaveProperty('laborCost');
    expect(toAccountFarmRecord({
      id: 'record-1', batchId: 'batch-1', fieldId: 'field-1', action: '浇水',
      detail: { amount: 10 }, images: ['a.jpg', 42], location: null,
      recordedAt: createdAt, source: 'manual', status: 'completed', createdAt,
    })).toMatchObject({ images: ['a.jpg'], recordedAt: createdAt.toISOString() });
    expect(toAccountFarmRecord({
      id: 'record-2', batchId: 'batch-1', fieldId: 'field-1', action: '施肥',
      detail: null, images: { hidden: true }, location: null,
      recordedAt: createdAt, source: 'manual', status: 'completed', createdAt,
    }).images).toEqual([]);
    expect(toAccountSupply({
      id: 'supply-1', name: '有机肥', unit: 'kg', total: '12.50', used: '2.25', createdAt,
    })).toMatchObject({ total: 12.5, used: 2.25 });
    expect(toAccountSupplyIssue({
      id: 'issue-1', supplyId: 'supply-1', batchId: 'batch-1',
      amount: '1.50', unitPrice: '3.20', createdAt,
    })).toMatchObject({ amount: 1.5, unitPrice: 3.2 });
    expect(toAccountUpload({
      id: 'upload-1', purpose: 'farm-record', url: null, sizeBytes: 1234n,
      status: 'ACTIVE', createdAt, objectKey: 'private/object', checksum: 'secret-checksum',
    })).toEqual({
      id: 'upload-1', purpose: 'farm-record', url: null, sizeBytes: '1234',
      status: 'ACTIVE', createdAt: createdAt.toISOString(),
    });
  });

  it('constructs allowlisted account, AI, order, and ledger objects only', () => {
    const profile = toAccountProfile({
      id: 'u1', tenantId: 't1', username: 'merchantA', role: 'merchant', agentId: null,
      displayName: '示例基地', phone: null, status: 'active', wxOpenid: 'openid-secret',
      passwordHash: 'hash-secret', sessionVersion: 9,
    });
    const ai = toAccountAiOperation({
      id: 'ai-1', kind: 'diagnose', status: 'SUCCEEDED', errorCategory: null,
      createdAt, updatedAt: createdAt, providerId: 'provider-secret',
      resultEnvelope: { secret: true }, operationKey: 'operation-secret',
    });
    const order = toAccountCreditOrder({
      id: 'order-1', resource: 'AI', quantity: 3, amountCents: 900,
      status: 'PAID', payChannel: 'manual', paidAt: createdAt, createdAt,
      tradeNo: 'trade-secret',
    });
    const creditAccount = toAccountCreditAccount({ aiBalance: 5, codeBalance: 8 }, [{
      id: 'ledger-1', resource: 'AI', delta: 5, balanceAfter: 5, reason: 'PURCHASE',
      note: null, createdAt, idempotencyKey: 'idempotency-secret',
    }]);
    const serialized = JSON.stringify({ profile, ai, order, creditAccount });

    for (const secret of [
      'passwordHash', 'wxOpenid', 'sessionVersion', 'providerId', 'resultEnvelope',
      'operationKey', 'tradeNo', 'idempotencyKey', 'hash-secret', 'openid-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(profile.deletionVerification).toBe('wechat');
  });

  it('defines the documented preview, row, byte, and exclusion limits', () => {
    expect(PREVIEW_LIMIT).toBe(20);
    expect(EXPORT_ROW_LIMIT).toBe(10_000);
    expect(EXPORT_BYTE_LIMIT).toBe(10 * 1024 * 1024);
    expect(EXPORT_EXCLUSIONS).toContain(
      '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
    );
  });

  it('escapes CSV cells containing commas, newlines, and quotes', () => {
    expect(escapeCsvCell('一号田,北区\n温室 "A"')).toBe('"一号田,北区\n温室 ""A"""');
    expect(escapeCsvCell('普通文本')).toBe('普通文本');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell('=HYPERLINK("https://example.com")')).toBe(
      '"\'=HYPERLINK(""https://example.com"")"',
    );
  });
});
