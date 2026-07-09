import { describe, expect, it } from 'vitest';
import {
  MAX_CODES_PER_BATCH,
  assertTraceGenerationCount,
  assertTraceGenerationRetryCount,
  buildTraceCodeCreateData,
  buildTraceCodeLookup,
  buildTraceGenerationKey,
  buildTraceGenerationRef,
  normalizeTraceGenerationRequestKey,
} from './trace.model';

describe('trace generation model helpers', () => {
  it('keeps the code-generation cap at 10000', () => {
    expect(MAX_CODES_PER_BATCH).toBe(10000);
  });

  it('accepts only integer counts inside the generation cap', () => {
    expect(() => assertTraceGenerationCount(1)).not.toThrow();
    expect(() => assertTraceGenerationCount(MAX_CODES_PER_BATCH)).not.toThrow();
    expect(() => assertTraceGenerationCount(0)).toThrow('生成数量须为 1~10000 的整数');
    expect(() => assertTraceGenerationCount(1.5)).toThrow('生成数量须为 1~10000 的整数');
    expect(() => assertTraceGenerationCount(MAX_CODES_PER_BATCH + 1)).toThrow('生成数量须为 1~10000 的整数');
  });

  it('trims request keys and rejects missing retry keys', () => {
    expect(normalizeTraceGenerationRequestKey('  req-1  ')).toBe('req-1');
    expect(() => normalizeTraceGenerationRequestKey()).toThrow('缺少幂等键');
    expect(() => normalizeTraceGenerationRequestKey('   ')).toThrow('缺少幂等键');
  });

  it('builds stable trace generation idempotency keys and billing refs', () => {
    const generationKey = buildTraceGenerationKey({
      tenantId: 't1',
      userId: 'op1',
      batchId: 'b1',
      requestKey: 'req-1',
    });

    expect(generationKey).toBe('trace.generate:t1:op1:b1:req-1');
    expect(buildTraceGenerationRef('b1', generationKey)).toEqual({
      refType: 'trace.generate',
      refId: 'b1',
      idempotencyKey: generationKey,
    });
  });

  it('builds the existing-code lookup used before and inside the transaction', () => {
    expect(buildTraceCodeLookup('t1', 'b1', 'key1')).toEqual({
      where: { tenantId: 't1', batchId: 'b1', generationKey: 'key1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('rejects duplicate retries when the requested count changes', () => {
    expect(() => assertTraceGenerationRetryCount(2, 2)).not.toThrow();
    expect(() => assertTraceGenerationRetryCount(2, 5)).toThrow('幂等键已用于生成 2 个溯源码,不能以 5 个重试');
  });

  it('builds trace-code createMany rows without mutating the input code list', () => {
    const codes = ['ORC-A', 'ORC-B'];
    const rows = buildTraceCodeCreateData({
      tenantId: 't1',
      batchId: 'b1',
      codes,
      reservationId: 'res1',
      generationKey: 'key1',
    });

    expect(rows).toEqual([
      { tenantId: 't1', batchId: 'b1', code: 'ORC-A', reservationId: 'res1', generationKey: 'key1' },
      { tenantId: 't1', batchId: 'b1', code: 'ORC-B', reservationId: 'res1', generationKey: 'key1' },
    ]);
    expect(codes).toEqual(['ORC-A', 'ORC-B']);
  });
});
