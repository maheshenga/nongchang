import type { PublicCoordinateMode, PublicTraceResult } from '@nongchang/shared';

export const PUBLIC_PAYLOAD_KEYS = ['desc', 'image', 'tag', 'weather', 'data', 'temp'] as const;

export function pickPublicPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_PAYLOAD_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return Object.keys(out).length ? out : null;
}

export type PublicTraceOpenResult = Extract<PublicTraceResult, { frozen: false }>;

export function projectPublicCoordinates(
  mode: PublicCoordinateMode,
  lng: number | null,
  lat: number | null,
): { fieldLng: number | null; fieldLat: number | null } {
  if (mode === 'hidden' || lng == null || lat == null) {
    return { fieldLng: null, fieldLat: null };
  }
  if (mode === 'approximate') {
    return {
      fieldLng: Math.round(lng * 100) / 100,
      fieldLat: Math.round(lat * 100) / 100,
    };
  }
  return { fieldLng: lng, fieldLat: lat };
}

export interface PublicTraceResponseInput {
  code: string;
  scanCount: number;
  tiandituKey: string | null;
  batch: {
    cropName: string;
    batchNo: string;
    plantDate: Date;
    expectedHarvest: Date;
    status: string;
  };
  field: { name: string } | null;
  agent: { region: string | null } | null;
  fieldLng: number | null;
  fieldLat: number | null;
  events: Array<{
    type: string;
    title: string;
    actor: string;
    location: string;
    occurredAt: Date;
    payload: unknown;
  }>;
  eventTotal: number;
  credentials: Array<{
    type: string;
    title: string;
    issuer: string;
    issuedAt: Date | null;
    fileUrl: string;
  }>;
  credentialTotal: number;
}

export function buildPublicTraceResponse(input: PublicTraceResponseInput): PublicTraceOpenResult {
  return {
    code: input.code,
    frozen: false,
    scanCount: input.scanCount,
    tiandituKey: input.tiandituKey,
    batch: {
      cropName: input.batch.cropName,
      batchNo: input.batch.batchNo,
      plantDate: input.batch.plantDate.toISOString(),
      expectedHarvest: input.batch.expectedHarvest.toISOString(),
      status: input.batch.status as PublicTraceOpenResult['batch']['status'],
      fieldName: input.field?.name ?? '',
      region: input.agent?.region ?? null,
      fieldLng: input.fieldLng,
      fieldLat: input.fieldLat,
    },
    events: input.events.map((event) => ({
      type: event.type as PublicTraceOpenResult['events'][number]['type'],
      title: event.title,
      actor: event.actor,
      location: event.location,
      occurredAt: event.occurredAt.toISOString(),
      payload: pickPublicPayload(event.payload),
    })),
    eventTotal: input.eventTotal,
    credentials: input.credentials.map((credential) => ({
      type: credential.type as PublicTraceOpenResult['credentials'][number]['type'],
      title: credential.title,
      issuer: credential.issuer,
      issuedAt: credential.issuedAt ? credential.issuedAt.toISOString() : null,
      fileUrl: credential.fileUrl,
    })),
    credentialTotal: input.credentialTotal,
  };
}
