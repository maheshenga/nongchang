import { describe, expect, it } from 'vitest';
import { FarmRecordSource } from '@nongchang/shared';
import { buildFarmRecordPayload, getSupplyAmountError, getSupplySelectionUpdate } from './payload';
import type { Batch } from '../../api/farm';

const batch: Batch = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '00000000-0000-4000-8000-000000000000',
  ownerId: '22222222-2222-4222-8222-222222222222',
  ownerName: null,
  fieldId: '33333333-3333-4333-8333-333333333333',
  batchNo: 'B-001',
  cropName: '白芍',
  plantDate: '2026-01-01T00:00:00.000Z',
  expectedHarvest: '2026-06-01T00:00:00.000Z',
  status: 'Growing',
  laborCost: 0,
  sellPrice: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  codeCount: 0,
  scanTotal: 0,
  inputCost: 0,
};

describe('RecordForm payload', () => {
  it('选中物料时提交 supplyId 和正数用量', () => {
    const payload = buildFarmRecordPayload({
      batch,
      action: '施肥',
      note: '追肥',
      cost: '12',
      labor: '0.5',
      images: [],
      location: '',
      source: FarmRecordSource.MINIAPP,
      recordedAt: '2026-06-19T00:00:00.000Z',
      supplyId: '44444444-4444-4444-8444-444444444444',
      supplyAmount: '3.5',
    });

    expect(payload.supplyId).toBe('44444444-4444-4444-8444-444444444444');
    expect(payload.supplyAmount).toBe(3.5);
  });

  it('未选物料时不提交物料字段', () => {
    const payload = buildFarmRecordPayload({
      batch,
      action: '巡田',
      note: '',
      cost: '',
      labor: '',
      images: [],
      location: '',
      source: FarmRecordSource.MINIAPP,
      recordedAt: '2026-06-19T00:00:00.000Z',
      supplyId: '',
      supplyAmount: '',
    });

    expect(payload).not.toHaveProperty('supplyId');
    expect(payload).not.toHaveProperty('supplyAmount');
  });

  it('选中物料但用量不是正数时给出错误', () => {
    expect(getSupplyAmountError('s1', '')).toBe('请输入物料用量');
    expect(getSupplyAmountError('s1', '0')).toBe('物料用量必须大于 0');
    expect(getSupplyAmountError('', '')).toBeNull();
  });

  it('切换或取消物料时清空已输入用量', () => {
    expect(getSupplySelectionUpdate('s1', 's2')).toEqual({ supplyId: 's2', supplyAmount: '' });
    expect(getSupplySelectionUpdate('s1', 's1')).toEqual({ supplyId: '', supplyAmount: '' });
  });
});
