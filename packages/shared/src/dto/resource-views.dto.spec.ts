import { describe, expect, it } from 'vitest';
import { BatchStatus, FarmRecordSource, TraceEventType } from '../enums';
import {
  batchViewSchema,
  farmRecordViewSchema,
  fieldViewSchema,
  traceCodeViewSchema,
  traceEventViewSchema,
} from './resource-views.dto';

const now = '2026-07-13T00:00:00.000Z';
const batch = {
  id: 'batch-1', tenantId: 'tenant-1', ownerId: 'owner-1', ownerName: null, fieldId: 'field-1',
  batchNo: 'B-001', cropName: 'Cabbage', plantDate: now, expectedHarvest: now, status: BatchStatus.GROWING,
  laborCost: 10, sellPrice: 30, createdAt: now, codeCount: 2, scanTotal: 5, inputCost: 8,
};
const field = {
  id: 'field-1', tenantId: 'tenant-1', ownerId: 'owner-1', ownerName: null,
  name: 'Field A', area: 12.5, lng: null, lat: null, iotDeviceId: null, createdAt: now,
};
const record = {
  id: 'record-1', tenantId: 'tenant-1', batchId: 'batch-1', fieldId: 'field-1', operatorId: 'user-1',
  ownerName: null, action: 'Fertilize', detail: { amount: 2 }, images: null, location: null,
  recordedAt: now, source: FarmRecordSource.WEB, status: 'completed', supplyId: null, supplyAmount: 2.5, createdAt: now,
};
const code = {
  id: 'code-1', tenantId: 'tenant-1', batchId: 'batch-1', code: 'ORC-001', scanCount: 0,
  status: 'active', reservationId: null, generationKey: null, createdAt: now,
};
const event = {
  id: 'event-1', tenantId: 'tenant-1', batchId: 'batch-1', type: TraceEventType.FARM, title: 'Fertilize',
  actor: 'Operator', location: 'Field A', occurredAt: now, payload: null, createdAt: now,
};

describe('resource response schemas', () => {
  it.each([
    ['batch', batchViewSchema, batch],
    ['field', fieldViewSchema, field],
    ['farm record', farmRecordViewSchema, record],
    ['trace code', traceCodeViewSchema, code],
    ['trace event', traceEventViewSchema, event],
  ])('parses a valid %s response', (_label, schema, fixture) => {
    expect(schema.parse(fixture)).toEqual(fixture);
  });

  it.each([
    ['batch', batchViewSchema, batch],
    ['field', fieldViewSchema, field],
    ['farm record', farmRecordViewSchema, record],
    ['trace code', traceCodeViewSchema, code],
    ['trace event', traceEventViewSchema, event],
  ])('rejects a %s response without id', (_label, schema, fixture) => {
    expect(() => schema.parse({ ...fixture, id: undefined })).toThrow();
  });

  it('keeps dates as strings, numeric amounts as numbers, and nullable fields', () => {
    const parsed = farmRecordViewSchema.parse(record);
    expect(typeof parsed.recordedAt).toBe('string');
    expect(typeof parsed.supplyAmount).toBe('number');
    expect(parsed.images).toBeNull();
    expect(fieldViewSchema.parse(field).lng).toBeNull();
  });

  it('accepts omitted nullable response fields and normalizes them to null', () => {
    const parsed = farmRecordViewSchema.parse({
      ...record,
      ownerName: undefined,
      detail: undefined,
      images: undefined,
      location: undefined,
      supplyId: undefined,
      supplyAmount: undefined,
    });
    expect(parsed).toMatchObject({
      ownerName: null,
      detail: null,
      images: null,
      location: null,
      supplyId: null,
      supplyAmount: null,
    });
  });

  it('rejects values outside the shared resource enums', () => {
    expect(() => batchViewSchema.parse({ ...batch, status: 'Unknown' })).toThrow();
    expect(() => farmRecordViewSchema.parse({ ...record, source: 'import' })).toThrow();
    expect(() => traceEventViewSchema.parse({ ...event, type: 'unknown' })).toThrow();
  });
});
