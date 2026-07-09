# Public Trace Response Boundary P4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `PublicTraceService.getByCode()` complexity and harden public trace data reliability by moving deterministic public-response projection into tested model helpers.

**Architecture:** Keep database reads, transaction boundaries, scan-count incrementing, scan detail best-effort writes, field coordinate lookup, and Tianditu config lookup inside `PublicTraceService`. Add `public-trace.model.ts` beside the service for pure helpers that build the public trace response and whitelist event payload fields. The service consumes the helper after it has gathered rows and side-effect results.

**Tech Stack:** NestJS 10, TypeScript, Vitest, existing backend service test pattern.

## Global Constraints

- Do not change public route paths, controller behavior, throttle config, request metadata handling, database queries, transaction behavior, or scanCount write behavior.
- Do not change `PublicTraceResult` DTO shape.
- Preserve frozen response semantics: frozen codes return `{ code, frozen: true }` before incrementing scan count or creating scan rows.
- Preserve public payload whitelist exactly: `desc`, `image`, `tag`, `weather`, `data`, `temp`.
- Preserve credential redaction: public credentials must not expose `id`, `batchId`, `serialNo`, `tenantId`, or `createdAt`.
- Preserve batch/event redaction: public responses must not expose internal ids, `tenantId`, `ownerId`, `fieldId`, or raw batch/event records.
- Follow TDD: add failing model tests before production helper implementation.

---

## File Structure

- Create: `packages/backend/src/modules/public-trace/public-trace.model.ts`
  - Owns pure public trace response projection and payload whitelist logic.
- Create: `packages/backend/src/modules/public-trace/public-trace.model.spec.ts`
  - Covers model helpers with RED/GREEN tests.
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
  - Replaces inline response projection with `buildPublicTraceResponse()`.
- Add: `docs/superpowers/plans/2026-07-09-p4-public-trace-response-boundary.md`
  - Tracks this P4 execution.

## Task 1: Add RED Model Tests

**Files:**
- Create: `packages/backend/src/modules/public-trace/public-trace.model.spec.ts`

**Interfaces:**
- Consumes: `pickPublicPayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null`
- Consumes: `buildPublicTraceResponse(input: PublicTraceResponseInput): Extract<PublicTraceResult, { frozen: false }>`
- Produces: regression coverage for public-response projection and data redaction.

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/public-trace/public-trace.model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPublicTraceResponse, pickPublicPayload } from './public-trace.model';

describe('public trace response model', () => {
  it('keeps only public payload fields and returns null for empty payloads', () => {
    expect(pickPublicPayload(null)).toBeNull();
    expect(pickPublicPayload(undefined)).toBeNull();
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
    });

    expect(response).toEqual({
      code: 'ORC-X',
      frozen: false,
      scanCount: 5,
      tiandituKey: 'TDT_KEY',
      batch: {
        cropName: '白芍',
        batchNo: 'PA-1',
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
      credentials: [
        {
          type: 'certificate',
          title: '有机认证',
          issuer: '认证中心',
          issuedAt: '2026-06-01T00:00:00.000Z',
          fileUrl: 'https://oss.example/cert.pdf',
        },
      ],
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
      field: null,
      agent: null,
      fieldLng: null,
      fieldLat: null,
      events: [],
      credentials: [{ type: 'report', title: '检测报告', issuer: '检测中心', issuedAt: null, fileUrl: 'https://oss.example/report.pdf' }],
    });

    expect(response.batch.fieldName).toBe('');
    expect(response.batch.region).toBeNull();
    expect(response.batch.fieldLng).toBeNull();
    expect(response.batch.fieldLat).toBeNull();
    expect(response.credentials[0].issuedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.model.spec.ts
```

Expected: FAIL because `public-trace.model.ts` does not exist yet.

## Task 2: Implement Public Trace Model Helpers

**Files:**
- Create: `packages/backend/src/modules/public-trace/public-trace.model.ts`

**Interfaces:**
- Produces: `pickPublicPayload()`
- Produces: `PublicTraceResponseInput`
- Produces: `buildPublicTraceResponse()`

- [ ] **Step 1: Add model implementation**

Create `packages/backend/src/modules/public-trace/public-trace.model.ts`:

```ts
import type { PublicTraceResult } from '@nongchang/shared';

export const PUBLIC_PAYLOAD_KEYS = ['desc', 'image', 'tag', 'weather', 'data', 'temp'] as const;

export function pickPublicPayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_PAYLOAD_KEYS) {
    if (payload[key] !== undefined) out[key] = payload[key];
  }
  return Object.keys(out).length ? out : null;
}

type PublicTraceOpenResult = Extract<PublicTraceResult, { frozen: false }>;

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
    payload: Record<string, unknown> | null;
  }>;
  credentials: Array<{
    type: string;
    title: string;
    issuer: string;
    issuedAt: Date | null;
    fileUrl: string;
  }>;
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
    credentials: input.credentials.map((credential) => ({
      type: credential.type as PublicTraceOpenResult['credentials'][number]['type'],
      title: credential.title,
      issuer: credential.issuer,
      issuedAt: credential.issuedAt ? credential.issuedAt.toISOString() : null,
      fileUrl: credential.fileUrl,
    })),
  };
}
```

- [ ] **Step 2: Verify GREEN for model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.model.spec.ts
```

Expected: PASS.

## Task 3: Replace Inline Response Projection In PublicTraceService

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`

**Interfaces:**
- Consumes: `buildPublicTraceResponse(input: PublicTraceResponseInput)`

- [ ] **Step 1: Update imports**

Replace:

```ts
import { PublicTraceResult } from '@nongchang/shared';
```

with:

```ts
import type { PublicTraceResult } from '@nongchang/shared';
import { buildPublicTraceResponse } from './public-trace.model';
```

- [ ] **Step 2: Remove local whitelist helper**

Delete local `PUBLIC_PAYLOAD_KEYS` and `pickPublicPayload()` from `public-trace.service.ts`. The model file owns them.

- [ ] **Step 3: Replace return projection**

Replace the final open-response object with:

```ts
      return buildPublicTraceResponse({
        code: traceCode.code,
        scanCount: updated.scanCount,
        tiandituKey,
        batch,
        field,
        agent,
        fieldLng,
        fieldLat,
        events,
        credentials,
      });
```

- [ ] **Step 4: Run focused backend tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace/public-trace.model.spec.ts src/modules/public-trace/public-trace.service.spec.ts src/modules/public-trace/client-ip.spec.ts
```

Expected: PASS.

## Task 4: Verify, Review, And Commit

**Files:**
- Verify: `packages/backend/src/modules/public-trace/public-trace.model.ts`
- Verify: `packages/backend/src/modules/public-trace/public-trace.model.spec.ts`
- Verify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Verify: `docs/superpowers/plans/2026-07-09-p4-public-trace-response-boundary.md`

**Interfaces:**
- Produces: one committed P4 maintainability and data-redaction slice.

- [ ] **Step 1: Run backend gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
corepack pnpm@10.33.2 --filter @nongchang/backend build
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Request review**

Use a reviewer subagent to inspect the P4 diff against this plan. Fix Critical or Important findings before committing.

- [ ] **Step 3: Inspect, stage, and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p4-public-trace-response-boundary.md packages/backend/src/modules/public-trace/public-trace.model.ts packages/backend/src/modules/public-trace/public-trace.model.spec.ts packages/backend/src/modules/public-trace/public-trace.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract public trace response model"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan addresses the public trace data reliability/security boundary without changing API behavior or scan writes.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: `pickPublicPayload`, `PublicTraceResponseInput`, and `buildPublicTraceResponse` are named consistently across tests, model, and service.
