import { describe, expect, it } from 'vitest';
import { buildPublicTraceResponse, pickPublicPayload } from './public-trace.model';

describe('public trace response model', () => {
  it('keeps only public payload fields and returns null for empty payloads', () => {
    expect(pickPublicPayload(null)).toBeNull();
    expect(pickPublicPayload(undefined)).toBeNull();
    expect(pickPublicPayload('raw-note')).toBeNull();
    expect(pickPublicPayload({ internalNote: 'hide-me' })).toBeNull();
    expect(pickPublicPayload({
      desc: '种植记录',
      image: 'https://oss.example/record.jpg',
      tag: '施肥',
      weather: '晴',
      data: { ph: 6.8 },
      temp: 24,
      internalNote: 'hide-me',
      operatorPhone: '13800000000',
    })).toEqual({
      desc: '种植记录',
      image: 'https://oss.example/record.jpg',
      tag: '施肥',
      weather: '晴',
      data: { ph: 6.8 },
      temp: 24,
    });
  });

  it('builds the public trace response while redacting internal row fields', () => {
    const response = buildPublicTraceResponse({
      code: 'ORC-X',
      scanCount: 5,
      tiandituKey: 'TDT_KEY',
      batch: {
        id: 'batch-internal',
        tenantId: 'tenant-hidden',
        ownerId: 'owner-hidden',
        fieldId: 'field-hidden',
        cropName: '白芍',
        batchNo: 'PA-1',
        plantDate: new Date('2023-10-15T00:00:00.000Z'),
        expectedHarvest: new Date('2026-05-10T00:00:00.000Z'),
        status: 'Harvested',
      },
      owner: { displayName: '大理基地' },
      field: { id: 'field-hidden', name: 'A区露地', ownerId: 'owner-hidden' },
      agent: { id: 'agent-hidden', region: '云南' },
      fieldLng: 100.25,
      fieldLat: 25.6,
      events: [
        {
          id: 'event-hidden',
          tenantId: 'tenant-hidden',
          batchId: 'batch-internal',
          type: 'origin',
          title: '种苗',
          actor: '村集体',
          location: '大理',
          occurredAt: new Date('2023-04-12T09:30:00.000Z'),
          payload: { desc: '起苗', internalNote: 'hide-me' },
        },
      ],
      eventTotal: 1,
      credentials: [
        {
          id: 'credential-hidden',
          tenantId: 'tenant-hidden',
          batchId: 'batch-internal',
          type: 'certificate',
          title: '有机认证',
          issuer: '认证中心',
          serialNo: 'OC-1',
          issuedAt: new Date('2026-06-01T00:00:00.000Z'),
          fileUrl: 'https://oss.example/cert.pdf',
          createdAt: new Date('2026-06-02T00:00:00.000Z'),
        },
      ],
      credentialTotal: 1,
    });

    expect(response).toEqual({
      code: 'ORC-X',
      frozen: false,
      scanCount: 5,
      tiandituKey: 'TDT_KEY',
      batch: {
        cropName: '白芍',
        batchNo: 'PA-1',
        merchantName: '大理基地',
        plantDate: '2023-10-15T00:00:00.000Z',
        expectedHarvest: '2026-05-10T00:00:00.000Z',
        status: 'Harvested',
        fieldName: 'A区露地',
        region: '云南',
        fieldLng: 100.25,
        fieldLat: 25.6,
      },
      events: [
        {
          type: 'origin',
          title: '种苗',
          actor: '村集体',
          location: '大理',
          occurredAt: '2023-04-12T09:30:00.000Z',
          payload: { desc: '起苗' },
        },
      ],
      eventTotal: 1,
      credentials: [
        {
          type: 'certificate',
          title: '有机认证',
          issuer: '认证中心',
          issuedAt: '2026-06-01T00:00:00.000Z',
          fileUrl: 'https://oss.example/cert.pdf',
        },
      ],
      credentialTotal: 1,
    });
    const json = JSON.stringify(response);
    expect(json).not.toContain('tenant-hidden');
    expect(json).not.toContain('owner-hidden');
    expect(json).not.toContain('field-hidden');
    expect(json).not.toContain('batch-internal');
    expect(json).not.toContain('credential-hidden');
    expect(json).not.toContain('OC-1');
    expect(json).not.toContain('hide-me');
  });

  it('falls back to empty field name and null region when optional rows are missing', () => {
    const response = buildPublicTraceResponse({
      code: 'ORC-X',
      scanCount: 1,
      tiandituKey: null,
      batch: {
        cropName: '白芍',
        batchNo: 'PA-1',
        plantDate: new Date('2023-10-15T00:00:00.000Z'),
        expectedHarvest: new Date('2026-05-10T00:00:00.000Z'),
        status: 'Harvested',
      },
      owner: { displayName: '未知商户' },
      field: null,
      agent: null,
      fieldLng: null,
      fieldLat: null,
      events: [],
      eventTotal: 0,
      credentials: [{ type: 'report', title: '检测报告', issuer: '检测中心', issuedAt: null, fileUrl: 'https://oss.example/report.pdf' }],
      credentialTotal: 1,
    });

    expect(response.batch.fieldName).toBe('');
    expect(response.batch.region).toBeNull();
    expect(response.batch.fieldLng).toBeNull();
    expect(response.batch.fieldLat).toBeNull();
    expect(response.credentials[0].issuedAt).toBeNull();
  });
});
