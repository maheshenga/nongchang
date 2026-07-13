import { describe, expect, it } from 'vitest';
import { publicTraceResponseSchema } from './public-trace.dto';

const openTrace = {
  code: 'ORC-X',
  frozen: false as const,
  scanCount: 1,
  tiandituKey: null,
  batch: {
    cropName: 'crop', batchNo: 'B-1', merchantName: '大理基地', plantDate: '2026-01-01T00:00:00.000Z',
    expectedHarvest: '2026-02-01T00:00:00.000Z', status: 'Growing', fieldName: 'F-1',
    region: null, fieldLng: null, fieldLat: null,
  },
  events: [],
  credentials: [],
};

describe('publicTraceResponseSchema', () => {
  it('requires collection totals beside bounded collections', () => {
    expect(() => publicTraceResponseSchema.parse(openTrace)).toThrow();
    expect(publicTraceResponseSchema.parse({ ...openTrace, eventTotal: 0, credentialTotal: 0 }))
      .toMatchObject({ eventTotal: 0, credentialTotal: 0 });
  });

  it('requires a public merchant display name without owner identifiers', () => {
    const parsed = publicTraceResponseSchema.parse({ ...openTrace, eventTotal: 0, credentialTotal: 0 });
    expect(parsed.batch.merchantName).toBe('大理基地');
    expect(parsed.batch).not.toHaveProperty('ownerId');
  });
});
