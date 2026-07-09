# P22 Anti-Fake Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic anti-fake scan and alert helpers from `AntiFakeService` so scan projection, alert thresholds, status lookup input, and freeze responses are directly tested.

**Architecture:** `AntiFakeService` remains responsible for scope resolution, Prisma reads/writes, and `ForbiddenException`. A new `anti-fake.model.ts` owns pure scan row projection, alert window where construction, candidate grouping, alert projection, and freeze response mapping with no database side effects. Existing anti-fake service tests contain mojibake descriptions; repair those while preserving assertions.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` anti-fake DTO and role types.

## Global Constraints

- Do not change `AntiFakeController` routes, DTO schemas, API response shape, Prisma query shape, scope resolution behavior, or exception messages.
- Preserve alert thresholds exactly: window `3_600_000` ms, minimum distinct IPs `3`, minimum scans `5`.
- Preserve scan list projection: `id`, `code`, `batchId`, `ip`, `userAgent`, `scannedAt` ISO string.
- Preserve system admin scan scope: `{ tenantId: user.tenantId }`.
- Preserve non-system scan scope behavior in service: resolve `ownedScopeWhere`, fetch batch ids, then use `{ tenantId, batchId: { in: ids } }`.
- Preserve alert time window query: merge scan scope with `scannedAt: { gte: new Date(Date.now() - WINDOW_MS) }`.
- Preserve alert status lookup query shape: `{ tenantId, code: { in: candidateCodes } }` with select `{ code: true, status: true }`.
- Preserve alert projection: `code`, first row `batchId`, distinct IP count, scan count, `locations` from unique IPs, latest scan ISO timestamp, and `frozen` when trace-code status is `frozen`.
- Preserve alert sorting: descending `scanCount`.
- Preserve freeze/unfreeze behavior: check scoped trace code first, throw `溯源码不在可操作范围内` if missing, update status, return `{ code, frozen: status === 'frozen' }`.
- Repair mojibake only in `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`; do not alter assertions except replacing corrupted descriptions with readable equivalents.

---

## File Structure

- Create `packages/backend/src/modules/anti-fake/anti-fake.model.ts`
  - Pure helpers for scan projection, scan scope where, alert candidate grouping/projection, status lookup args, and freeze responses.
- Create `packages/backend/src/modules/anti-fake/anti-fake.model.spec.ts`
  - Direct helper tests for thresholds, projection, grouping, frozen status, sorting, and freeze response mapping.
- Modify `packages/backend/src/modules/anti-fake/anti-fake.service.ts`
  - Replace inline pure logic with imports from `anti-fake.model.ts`.
- Modify `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`
  - Repair corrupted Chinese test descriptions.

---

### Task 1: Add Anti-Fake Model Tests

**Files:**
- Create: `packages/backend/src/modules/anti-fake/anti-fake.model.spec.ts`

**Interfaces:**
- Future exports:
  - `ANTI_FAKE_ALERT_WINDOW_MS`
  - `ANTI_FAKE_MIN_DISTINCT_IPS`
  - `ANTI_FAKE_MIN_SCANS`
  - `ScanRow`
  - `TraceCodeStatusRow`
  - `buildTraceScanItem(row: ScanRow): TraceScanItem`
  - `buildScopedScanWhere(input: { tenantId: string; batchIds: string[] }): Record<string, unknown>`
  - `buildAlertWindowWhere(baseWhere: Record<string, unknown>, nowMs: number): Record<string, unknown>`
  - `buildAntiFakeAlertCandidates(rows: ScanRow[])`
  - `buildTraceCodeStatusWhere(tenantId: string, codes: string[])`
  - `buildAntiFakeAlerts(input: { candidates: AntiFakeAlertCandidate[]; statuses: TraceCodeStatusRow[] }): AntiFakeAlert[]`
  - `buildFreezeResponse(code: string, status: 'frozen' | 'active'): FreezeResponse`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/anti-fake/anti-fake.model.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  ANTI_FAKE_ALERT_WINDOW_MS,
  ANTI_FAKE_MIN_DISTINCT_IPS,
  ANTI_FAKE_MIN_SCANS,
  buildAlertWindowWhere,
  buildAntiFakeAlertCandidates,
  buildAntiFakeAlerts,
  buildFreezeResponse,
  buildScopedScanWhere,
  buildTraceCodeStatusWhere,
  buildTraceScanItem,
  type ScanRow,
} from './anti-fake.model';

function scan(code: string, ip: string, minute: number): ScanRow {
  return {
    id: `${code}-${ip}-${minute}`,
    code,
    batchId: `b-${code}`,
    ip,
    userAgent: null,
    scannedAt: new Date(`2026-01-01T00:0${minute}:00.000Z`),
  };
}

describe('anti-fake model helpers', () => {
  it('projects scan rows and builds scoped where clauses', () => {
    expect(ANTI_FAKE_ALERT_WINDOW_MS).toBe(3_600_000);
    expect(ANTI_FAKE_MIN_DISTINCT_IPS).toBe(3);
    expect(ANTI_FAKE_MIN_SCANS).toBe(5);

    expect(buildTraceScanItem({
      id: 's1',
      code: 'C1',
      batchId: 'b1',
      ip: '1.1.1.1',
      userAgent: 'ua',
      scannedAt: new Date('2026-06-14T10:00:00.000Z'),
    })).toEqual({
      id: 's1',
      code: 'C1',
      batchId: 'b1',
      ip: '1.1.1.1',
      userAgent: 'ua',
      scannedAt: '2026-06-14T10:00:00.000Z',
    });

    expect(buildScopedScanWhere({ tenantId: 't1', batchIds: ['b1', 'b2'] })).toEqual({
      tenantId: 't1',
      batchId: { in: ['b1', 'b2'] },
    });
  });

  it('builds alert window where without mutating base scope', () => {
    const base = { tenantId: 't1', batchId: { in: ['b1'] } };
    const where = buildAlertWindowWhere(base, Date.parse('2026-01-01T01:00:00.000Z'));

    expect(base).toEqual({ tenantId: 't1', batchId: { in: ['b1'] } });
    expect(where).toEqual({
      tenantId: 't1',
      batchId: { in: ['b1'] },
      scannedAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
    });
  });

  it('groups alert candidates by minimum scan count and distinct IPs', () => {
    const rows = [
      scan('HOT', '1.1.1.1', 1),
      scan('HOT', '2.2.2.2', 2),
      scan('HOT', '3.3.3.3', 3),
      scan('HOT', '1.1.1.1', 4),
      scan('HOT', '2.2.2.2', 5),
      scan('SOLO', '9.9.9.9', 1),
      scan('SOLO', '9.9.9.9', 2),
      scan('SOLO', '9.9.9.9', 3),
      scan('SOLO', '9.9.9.9', 4),
      scan('SOLO', '9.9.9.9', 5),
      scan('LOW', '1.1.1.1', 1),
      scan('LOW', '2.2.2.2', 2),
      scan('LOW', '3.3.3.3', 3),
    ];

    const candidates = buildAntiFakeAlertCandidates(rows);

    expect(candidates.map((candidate) => candidate.code)).toEqual(['HOT']);
    expect(candidates[0].ips).toEqual(new Set(['1.1.1.1', '2.2.2.2', '3.3.3.3']));
    expect(buildTraceCodeStatusWhere('t1', ['HOT'])).toEqual({
      tenantId: 't1',
      code: { in: ['HOT'] },
    });
  });

  it('projects alerts with frozen status and sorts by scan count desc', () => {
    const hot = buildAntiFakeAlertCandidates([
      scan('HOT', '1.1.1.1', 1),
      scan('HOT', '2.2.2.2', 2),
      scan('HOT', '3.3.3.3', 3),
      scan('HOT', '1.1.1.1', 4),
      scan('HOT', '2.2.2.2', 5),
      scan('HOT', '4.4.4.4', 5),
      scan('FRZ', '1.1.1.1', 1),
      scan('FRZ', '2.2.2.2', 2),
      scan('FRZ', '3.3.3.3', 3),
      scan('FRZ', '1.1.1.1', 4),
      scan('FRZ', '2.2.2.2', 5),
    ]);

    const alerts = buildAntiFakeAlerts({
      candidates: hot,
      statuses: [{ code: 'FRZ', status: 'frozen' }, { code: 'HOT', status: 'active' }],
    });

    expect(alerts.map((alert) => alert.code)).toEqual(['HOT', 'FRZ']);
    expect(alerts[0]).toMatchObject({ code: 'HOT', distinctIps: 4, scanCount: 6, frozen: false });
    expect(alerts[0].lastScanAt).toBe('2026-01-01T00:05:00.000Z');
    expect(alerts[1]).toMatchObject({ code: 'FRZ', distinctIps: 3, scanCount: 5, frozen: true });
  });

  it('builds freeze responses from target status', () => {
    expect(buildFreezeResponse('C1', 'frozen')).toEqual({ code: 'C1', frozen: true });
    expect(buildFreezeResponse('C1', 'active')).toEqual({ code: 'C1', frozen: false });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/anti-fake/anti-fake.model.spec.ts
```

Expected: FAIL because `./anti-fake.model` does not exist.

---

### Task 2: Implement Anti-Fake Model Helpers

**Files:**
- Create: `packages/backend/src/modules/anti-fake/anti-fake.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Create `packages/backend/src/modules/anti-fake/anti-fake.model.ts`:

```typescript
import type { AntiFakeAlert, FreezeResponse, TraceScanItem } from '@nongchang/shared';

export const ANTI_FAKE_ALERT_WINDOW_MS = 3_600_000;
export const ANTI_FAKE_MIN_DISTINCT_IPS = 3;
export const ANTI_FAKE_MIN_SCANS = 5;

export interface ScanRow {
  id: string;
  code: string;
  batchId: string;
  ip: string;
  userAgent: string | null;
  scannedAt: Date;
}

export interface TraceCodeStatusRow {
  code: string;
  status: string;
}

export interface AntiFakeAlertCandidate {
  code: string;
  list: ScanRow[];
  ips: Set<string>;
}

export function buildTraceScanItem(row: ScanRow): TraceScanItem {
  return {
    id: row.id,
    code: row.code,
    batchId: row.batchId,
    ip: row.ip,
    userAgent: row.userAgent,
    scannedAt: row.scannedAt.toISOString(),
  };
}

export function buildScopedScanWhere(input: { tenantId: string; batchIds: string[] }): Record<string, unknown> {
  return { tenantId: input.tenantId, batchId: { in: input.batchIds } };
}

export function buildAlertWindowWhere(baseWhere: Record<string, unknown>, nowMs: number): Record<string, unknown> {
  return { ...baseWhere, scannedAt: { gte: new Date(nowMs - ANTI_FAKE_ALERT_WINDOW_MS) } };
}

export function buildAntiFakeAlertCandidates(rows: ScanRow[]): AntiFakeAlertCandidate[] {
  const byCode = new Map<string, ScanRow[]>();
  for (const row of rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  const candidates: AntiFakeAlertCandidate[] = [];
  for (const [code, list] of byCode) {
    const ips = new Set(list.map((row) => row.ip));
    if (ips.size < ANTI_FAKE_MIN_DISTINCT_IPS || list.length < ANTI_FAKE_MIN_SCANS) continue;
    candidates.push({ code, list, ips });
  }
  return candidates;
}

export function buildTraceCodeStatusWhere(tenantId: string, codes: string[]) {
  return { tenantId, code: { in: codes } };
}

export function buildAntiFakeAlerts(input: {
  candidates: AntiFakeAlertCandidate[];
  statuses: TraceCodeStatusRow[];
}): AntiFakeAlert[] {
  const statusByCode = new Map(input.statuses.map((row) => [row.code, row.status]));
  const alerts = input.candidates.map(({ code, list, ips }) => {
    const last = list.reduce((a, b) => (a.scannedAt > b.scannedAt ? a : b));
    return {
      code,
      batchId: list[0].batchId,
      distinctIps: ips.size,
      scanCount: list.length,
      locations: [...ips],
      lastScanAt: last.scannedAt.toISOString(),
      frozen: statusByCode.get(code) === 'frozen',
    };
  });
  return alerts.sort((a, b) => b.scanCount - a.scanCount);
}

export function buildFreezeResponse(code: string, status: 'frozen' | 'active'): FreezeResponse {
  return { code, frozen: status === 'frozen' };
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/anti-fake/anti-fake.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire AntiFakeService and Repair Test Text

**Files:**
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.service.ts`
- Modify: `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`

**Interfaces:**
- Consumes helpers from `./anti-fake.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  buildAlertWindowWhere,
  buildAntiFakeAlertCandidates,
  buildAntiFakeAlerts,
  buildFreezeResponse,
  buildScopedScanWhere,
  buildTraceCodeStatusWhere,
  buildTraceScanItem,
  type ScanRow,
  type TraceCodeStatusRow,
} from './anti-fake.model';
```

Replace:
- `WINDOW_MS`, `MIN_DISTINCT_IPS`, `MIN_SCANS`, and local `ScanRow` with imports.
- Non-system `scanWhere` return object with `buildScopedScanWhere({ tenantId: user.tenantId, batchIds: batches.map((b) => b.id) })`.
- `listScans` row projection with `rows.map(buildTraceScanItem)`.
- `listAlerts` time window where with `buildAlertWindowWhere(await this.scanWhere(user), Date.now())`.
- `listAlerts` grouping/threshold logic with `buildAntiFakeAlertCandidates(rows)`.
- Trace-code status lookup where with `buildTraceCodeStatusWhere(user.tenantId, candidates.map((c) => c.code))`.
- Alert projection/sort with `buildAntiFakeAlerts({ candidates, statuses: tcs })`.
- `setStatus` return with `buildFreezeResponse(code, status)`.

Keep:
- System-admin scan scope branch unchanged.
- Scope resolution via `ScopeService`.
- Prisma method names, orderBy, take, select, and update shapes.
- `ForbiddenException('溯源码不在可操作范围内')`.

- [ ] **Step 2: Repair mojibake in service tests**

In `packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts`, repair corrupted test descriptions only:

```typescript
it('sysadmin 仅按 tenantId 过滤,倒序', async () => { ... });
it('merchant 缺 ownerId 时 fail-closed 抛 Forbidden', async () => { ... });
it('多 IP 且高频命中告警', async () => { ... });
it('已冻结的码 frozen=true', async () => { ... });
it('单 IP 高频不告警: IP 多样性不足', async () => { ... });
it('多 IP 低频不告警: 次数不足', async () => { ... });
it('作用域内冻结成功置 frozen', async () => { ... });
it('越权(码不在作用域)抛 Forbidden', async () => { ... });
it('unfreeze 置回 active', async () => { ... });
```

- [ ] **Step 3: Run focused anti-fake tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/anti-fake/anti-fake.model.spec.ts src/modules/anti-fake/anti-fake.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run full verification**

Run serially:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- Build exits `0`.
- Backend unit tests exit `0`.
- `diff --check` exits `0`; LF-to-CRLF warnings are acceptable on Windows if there are no whitespace errors.

- [ ] **Step 2: Review scope**

Review P22 anti-fake model boundary. Ensure no controller/DTO/query/scope/write behavior changed. Verify thresholds, scan projection, alert candidate grouping, status lookup, alert projection/sorting, freeze response, and repaired test text.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p22-anti-fake-model-boundary.md packages/backend/src/modules/anti-fake/anti-fake.model.ts packages/backend/src/modules/anti-fake/anti-fake.model.spec.ts packages/backend/src/modules/anti-fake/anti-fake.service.ts packages/backend/src/modules/anti-fake/anti-fake.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract anti-fake model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers scan projection, scope where helper, alert thresholds/window, candidate grouping, status lookup, alert projection/sorting, freeze response, service wiring, test text repair, focused tests, full verification, review, and commit.
- Placeholder scan: No placeholders beyond the self-review sentence.
- Type consistency: Helper names and signatures are consistent across tasks.
