import { describe, expect, it } from 'vitest';
import {
  buildInboundSupplySubmission,
  buildIssueSupplySubmission,
  getSupplyUsedPercent,
} from './LogisticsTracker.model';

describe('LogisticsTracker model helpers', () => {
  it('clamps inventory used percent with the existing table semantics', () => {
    expect(getSupplyUsedPercent({ total: 100, used: 20 })).toBe(20);
    expect(getSupplyUsedPercent({ total: 3, used: 2 })).toBe(67);
    expect(getSupplyUsedPercent({ total: 0, used: 5 })).toBe(0);
    expect(getSupplyUsedPercent({ total: -10, used: 5 })).toBe(0);
    expect(getSupplyUsedPercent({ total: 100, used: 140 })).toBe(100);
  });

  it('builds issue supply payloads and preserves existing validation messages', () => {
    expect(buildIssueSupplySubmission({ supplyId: '', amount: 1, batchId: 'batch-1' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 0, batchId: 'batch-1' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 2, batchId: '' }, true)).toEqual({
      ok: false,
      message: '请选择关联批次',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 2, batchId: 'batch-1' }, false)).toEqual({
      ok: false,
      message: '当前视图只读',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 2, batchId: 'batch-1' }, true)).toEqual({
      ok: true,
      supplyId: 'supply-1',
      input: { batchId: 'batch-1', amount: 2 },
    });
  });

  it('builds inbound supply payloads and preserves existing validation messages', () => {
    expect(buildInboundSupplySubmission({ name: '', amount: 10, unit: '箱' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildInboundSupplySubmission({ name: '复合肥', amount: 0, unit: '箱' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildInboundSupplySubmission({ name: '复合肥', amount: 10, unit: '箱' }, false)).toEqual({
      ok: false,
      message: '当前视图只读',
    });
    expect(buildInboundSupplySubmission({ name: '复合肥', amount: 10, unit: '箱' }, true)).toEqual({
      ok: true,
      input: { name: '复合肥', unit: '箱', amount: 10 },
    });
  });
});
