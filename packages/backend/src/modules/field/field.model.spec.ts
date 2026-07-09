import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIELD_LIST_CAP,
  buildFieldCreateData,
  buildFieldIds,
  buildFieldListFindManyArgs,
  buildFieldOwnerIds,
  buildFieldPagination,
  enrichFieldRows,
  type FieldRow,
} from './field.model';

const fieldA: FieldRow = {
  id: 'f1',
  tenantId: 't1',
  ownerId: 'm1',
  name: 'A区',
  area: 10,
  iotDeviceId: null,
  createdAt: new Date('2026-06-14T10:00:00.000Z'),
};
const fieldB: FieldRow = {
  id: 'f2',
  tenantId: 't1',
  ownerId: 'm1',
  name: 'B区',
  area: 20,
  iotDeviceId: 'dev1',
  createdAt: new Date('2026-06-15T10:00:00.000Z'),
};

describe('field.model', () => {
  it('builds create data and normalizes optional device id', () => {
    expect(buildFieldCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      dto: { ownerId: 'dto-owner', name: 'A区', area: 10, lng: 100, lat: 25 },
    })).toEqual({ tenantId: 't1', ownerId: 'm1', name: 'A区', area: 10, iotDeviceId: null });
  });

  it('preserves explicit iotDeviceId in create data', () => {
    expect(buildFieldCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      dto: { ownerId: 'dto-owner', name: 'A区', area: 10, lng: 100, lat: 25, iotDeviceId: 'iot-1' },
    }).iotDeviceId).toBe('iot-1');
  });

  it('builds capped and paginated findMany args', () => {
    expect(buildFieldListFindManyArgs({ where: { tenantId: 't1' } })).toEqual({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_FIELD_LIST_CAP,
    });
    expect(buildFieldPagination({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
    expect(buildFieldListFindManyArgs({ where: { tenantId: 't1' }, page: 3, pageSize: 10 })).toEqual({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 10,
    });
  });

  it('extracts field and unique owner ids', () => {
    expect(buildFieldIds([fieldA, fieldB])).toEqual(['f1', 'f2']);
    expect(buildFieldOwnerIds([fieldA, fieldB])).toEqual(['m1']);
  });

  it('enriches owner names and coordinates with null fallback', () => {
    expect(enrichFieldRows({
      fields: [fieldA, fieldB],
      owners: [{ id: 'm1', displayName: '张三农场' }],
      coords: [{ id: 'f1', lng: 100.1, lat: 25.2 }],
    })).toEqual([
      { ...fieldA, ownerName: '张三农场', lng: 100.1, lat: 25.2 },
      { ...fieldB, ownerName: '张三农场', lng: null, lat: null },
    ]);
  });
});
