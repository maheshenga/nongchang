# P0 Farm Record Auto-Publication Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with the repository's red-green-refactor workflow and review each checkpoint before proceeding. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish every newly completed farm record exactly once into the consumer trace timeline, atomically and with a strict public-data allowlist.

**Architecture:** `FarmRecord` remains the operational source and `TraceEvent` remains the immutable public projection. A nullable unique `TraceEvent.sourceFarmRecordId` links them; completed creation and pending-to-completed transitions create both rows in one interactive Prisma transaction, while existing historical rows remain unchanged.

**Tech Stack:** TypeScript 5.8, NestJS 10, Prisma 5/PostgreSQL, Zod, React 19, Vitest 2, Supertest.

## Global Constraints

- Automatic publication is mandatory for newly completed records; there is no second approval action.
- Historical completed records must not be backfilled by the migration.
- Public output must exclude costs, labor, material, supply usage, exact operation GPS, internal IDs, and individual operator identity.
- Do not introduce Redis, Kafka, a worker process, or a new runtime dependency.
- Preserve existing tenant, owner, batch, field, and supply fail-closed checks.
- Preserve existing API request shapes for `POST /api/farm-records` and `PATCH /api/farm-records/:id/status`.
- Use red-green-refactor for every behavior change.
- Do not modify the pre-existing user change in `packages/web/src/api/trace.spec.ts`.

---

## File Structure

- Modify `packages/backend/src/modules/farm-record/farm-record.model.ts`: pure public-projection mapper and projection input types.
- Modify `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`: mapper allowlist and normalization tests.
- Modify `packages/backend/prisma/schema.prisma`: optional one-to-one FarmRecord-to-TraceEvent source relation.
- Create `packages/backend/prisma/migrations/20260717000000_farm_record_trace_projection/migration.sql`: nullable source column, unique index, and foreign key.
- Modify `packages/backend/src/modules/farm-record/farm-record.service.ts`: shared transactional create/publish path and forward-only status transition.
- Modify `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`: completed, pending, quota, rollback, idempotency, and state-machine tests.
- Modify `packages/web/src/components/FarmRecords.tsx`: truthful completion feedback.
- Modify `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`: UI feedback assertion.
- Create `packages/backend/test/farm-record-publication.e2e-spec.ts`: real database farm-record-to-public-trace contract.
- Modify `packages/backend/test/supply.e2e-spec.ts`: relation-aware cleanup order.

---

### Task 1: Build the Public Projection Mapper

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.ts`

**Interfaces:**
- Consumes: existing `FarmRecord` values `id`, `tenantId`, `batchId`, `action`, `detail`, `images`, and `recordedAt`, plus trusted `ownerDisplayName` and `fieldName`.
- Produces: `buildFarmRecordTraceEventData(input): FarmRecordTraceEventData`.
- Produces: `FarmRecordTraceEventData`, a plain structure accepted by Prisma after Task 2 adds the schema field.

- [ ] **Step 1: Write failing mapper tests**

Append focused tests to `farm-record.model.spec.ts`:

```typescript
import { buildFarmRecordTraceEventData } from './farm-record.model';

describe('buildFarmRecordTraceEventData', () => {
  const base = {
    record: {
      id: 'fr1',
      tenantId: 'tenant1',
      batchId: 'batch1',
      action: '  施肥  ',
      detail: { note: '  叶面追肥完成  ', cost: 200, labor: 3, material: '复合肥' },
      images: ['https://cdn.example/farm-1.jpg', 'https://cdn.example/farm-2.jpg'],
      recordedAt: new Date('2026-07-17T01:02:03.000Z'),
    },
    ownerDisplayName: '示范农场',
    fieldName: '一号地块',
  };

  it('maps a completed record to the public farm-event allowlist', () => {
    expect(buildFarmRecordTraceEventData(base)).toEqual({
      tenantId: 'tenant1',
      batchId: 'batch1',
      type: 'farm',
      title: '施肥',
      actor: '示范农场',
      location: '一号地块',
      occurredAt: new Date('2026-07-17T01:02:03.000Z'),
      payload: { desc: '叶面追肥完成', image: 'https://cdn.example/farm-1.jpg' },
      sourceFarmRecordId: 'fr1',
    });
  });

  it('supports web detail.desc and excludes private or unknown fields', () => {
    const result = buildFarmRecordTraceEventData({
      ...base,
      record: {
        ...base.record,
        detail: { desc: '完成除草', cost: 99, labor: 8, supplyId: 'hidden', extra: 'hidden' },
        images: [],
      },
    });
    expect(result.payload).toEqual({ desc: '完成除草' });
    expect(JSON.stringify(result)).not.toContain('cost');
    expect(JSON.stringify(result)).not.toContain('labor');
    expect(JSON.stringify(result)).not.toContain('supplyId');
    expect(JSON.stringify(result)).not.toContain('extra');
  });

  it('uses no payload when no public description or valid image exists', () => {
    expect(buildFarmRecordTraceEventData({
      ...base,
      record: { ...base.record, detail: { cost: 1 }, images: [1, null] },
    }).payload).toBeUndefined();
  });

  it('trims descriptions to 2000 Unicode code points', () => {
    const desc = `${'农'.repeat(2000)}尾部`;
    const result = buildFarmRecordTraceEventData({
      ...base,
      record: { ...base.record, detail: { note: desc }, images: null },
    });
    expect(Array.from((result.payload as { desc: string }).desc)).toHaveLength(2000);
    expect((result.payload as { desc: string }).desc.endsWith('尾部')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the mapper test and verify RED**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts
```

Expected: FAIL because `buildFarmRecordTraceEventData` is not exported.

- [ ] **Step 3: Implement the minimal pure mapper**

Add to `farm-record.model.ts`:

```typescript
import { TraceEventType } from '@nongchang/shared';

const MAX_PUBLIC_FARM_DESCRIPTION_CODE_POINTS = 2_000;

export interface FarmRecordTraceSource {
  id: string;
  tenantId: string;
  batchId: string;
  action: string;
  detail: unknown;
  images: unknown;
  recordedAt: Date;
}

export interface FarmRecordTraceEventData {
  tenantId: string;
  batchId: string;
  type: typeof TraceEventType.FARM;
  title: string;
  actor: string;
  location: string;
  occurredAt: Date;
  payload?: Prisma.InputJsonValue;
  sourceFarmRecordId: string;
}

function publicDescription(detail: unknown): string | undefined {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return undefined;
  const row = detail as Record<string, unknown>;
  const raw = typeof row.note === 'string' && row.note.trim()
    ? row.note
    : typeof row.desc === 'string' && row.desc.trim()
      ? row.desc
      : '';
  if (!raw) return undefined;
  return Array.from(raw.trim()).slice(0, MAX_PUBLIC_FARM_DESCRIPTION_CODE_POINTS).join('');
}

function firstPublicImage(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  return images.find((item): item is string => typeof item === 'string' && item.length > 0);
}

export function buildFarmRecordTraceEventData(input: {
  record: FarmRecordTraceSource;
  ownerDisplayName: string;
  fieldName: string;
}): FarmRecordTraceEventData {
  const desc = publicDescription(input.record.detail);
  const image = firstPublicImage(input.record.images);
  const payload = { ...(desc ? { desc } : {}), ...(image ? { image } : {}) };
  return {
    tenantId: input.record.tenantId,
    batchId: input.record.batchId,
    type: TraceEventType.FARM,
    title: input.record.action.trim(),
    actor: input.ownerDisplayName,
    location: input.fieldName,
    occurredAt: input.record.recordedAt,
    payload: Object.keys(payload).length ? payload : undefined,
    sourceFarmRecordId: input.record.id,
  };
}
```

- [ ] **Step 4: Run mapper tests and verify GREEN**

Run the Task 1 command again.

Expected: all `farm-record.model.spec.ts` tests pass.

- [ ] **Step 5: Commit the mapper**

```powershell
git add packages/backend/src/modules/farm-record/farm-record.model.ts packages/backend/src/modules/farm-record/farm-record.model.spec.ts
git commit -m "feat(trace): map farm records to public events"
```

---

### Task 2: Add the One-to-One Projection Relation

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260717000000_farm_record_trace_projection/migration.sql`

**Interfaces:**
- Consumes: `FarmRecordTraceEventData.sourceFarmRecordId` from Task 1.
- Produces: Prisma `TraceEventCreateInput.sourceFarmRecordId` and `TraceEventWhereUniqueInput.sourceFarmRecordId`.

- [ ] **Step 1: Add the nullable relation to Prisma schema**

Add the relation fields exactly as follows:

```prisma
model FarmRecord {
  // existing scalar fields and relations
  traceEvent TraceEvent?
}

model TraceEvent {
  // existing scalar fields
  sourceFarmRecordId String?     @unique @map("source_farm_record_id")
  sourceFarmRecord   FarmRecord? @relation(fields: [sourceFarmRecordId], references: [id], onDelete: Restrict)
  batch              Batch       @relation(fields: [batchId], references: [id])
}
```

- [ ] **Step 2: Create the additive SQL migration**

Create `migration.sql`:

```sql
ALTER TABLE "trace_events"
ADD COLUMN "source_farm_record_id" TEXT;

CREATE UNIQUE INDEX "trace_events_source_farm_record_id_key"
ON "trace_events"("source_farm_record_id");

ALTER TABLE "trace_events"
ADD CONSTRAINT "trace_events_source_farm_record_id_fkey"
FOREIGN KEY ("source_farm_record_id") REFERENCES "farm_records"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
```

The initial migration defines both `farm_records.id` and `trace_events.id` as PostgreSQL `TEXT`; the new foreign-key column must use the same database type even though application values are UUID-formatted strings.

- [ ] **Step 3: Validate and regenerate the Prisma client**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend exec prisma validate
pnpm.cmd --filter @nongchang/backend exec prisma generate
```

Expected: both commands exit 0 and the generated client accepts `sourceFarmRecordId`.

- [ ] **Step 4: Confirm the migration contains no backfill**

Run:

```powershell
Select-String -LiteralPath 'packages/backend/prisma/migrations/20260717000000_farm_record_trace_projection/migration.sql' -Pattern 'INSERT','UPDATE trace_events','UPDATE farm_records'
```

Expected: no matches.

- [ ] **Step 5: Commit the schema migration**

```powershell
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260717000000_farm_record_trace_projection/migration.sql
git commit -m "feat(trace): link farm records to public events"
```

---

### Task 3: Publish Completed Records During Creation

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`

**Interfaces:**
- Consumes: `buildFarmRecordTraceEventData` from Task 1.
- Consumes: Prisma relation from Task 2.
- Produces: atomic completed-record creation for both quota and non-quota paths.

- [ ] **Step 1: Extend the service mock and write failing publication tests**

Replace `makeService` so the scope mocks still fail closed, the batch lookup returns trusted publication context, and every interactive transaction exposes `traceEvent.create`:

```typescript
function makeService(overrides: any = {}) {
  let created: any;
  let published: any;
  const farmRecord = {
    create: async (args: any) => {
      created = args;
      return { id: 'fr1', ...args.data };
    },
    aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
  };
  const traceEvent = {
    create: async (args: any) => {
      if (overrides.publishError) throw new Error('publish failed');
      published = args;
      return { id: 'te1', ...args.data };
    },
  };
  const supplyIssue = {
    aggregate: async () => ({ _sum: { amount: overrides.quota ?? 0 } }),
  };
  const tx = {
    farmRecord,
    traceEvent,
    supplyIssue,
    $queryRaw: async () => [{ id: 'locked' }],
  };
  const prisma = {
    batch: {
      findFirst: async ({ where }: any = {}) => {
        if (overrides.batchScoped === false) return null;
        if (where?.fieldId && overrides.batchFieldMatches === false) return null;
        return {
          id: 'b1',
          ownerId: 'm1',
          fieldId: FIELD,
          owner: { displayName: '示范农场' },
          field: { name: '一号地块' },
        };
      },
    },
    field: { findFirst: async () => (overrides.fieldScoped === false ? null : { id: 'f1' }) },
    farmRecord,
    traceEvent,
    supplyIssue,
    supply: {
      findFirst: async () => {
        if (overrides.supplyScoped === false) return null;
        return { id: 'sup1', ownerId: overrides.supplyOwnerMatches === false ? 'm2' : 'm1' };
      },
    },
    $transaction: async (fn: any) => fn(tx),
  };
  return {
    svc: new FarmRecordService(prisma as any, new ScopeService()),
    get created() { return created; },
    get published() { return published; },
  };
}
```

Add tests:

```typescript
it('completed create publishes exactly one linked public event', async () => {
  const h = makeService();
  const result = await h.svc.create(merchant, {
    batchId: BATCH,
    fieldId: FIELD,
    action: '施肥',
    detail: { note: '完成追肥', cost: 200 },
    images: ['https://cdn.example/1.jpg'],
    recordedAt: '2026-07-17T01:02:03.000Z',
    source: 'miniapp',
  });
  expect(result.status).toBe('completed');
  expect(h.published.data.sourceFarmRecordId).toBe('fr1');
  expect(h.published.data.payload).toEqual({ desc: '完成追肥', image: 'https://cdn.example/1.jpg' });
});

it('pending create remains private', async () => {
  const h = makeService();
  await h.svc.create(merchant, {
    batchId: BATCH,
    fieldId: FIELD,
    action: '除草',
    recordedAt: '2026-07-17T01:02:03.000Z',
    source: 'web',
    status: 'pending',
  });
  expect(h.published).toBeUndefined();
});

it('completed supply-quota create publishes inside the quota transaction', async () => {
  const h = makeService({ quota: 100 });
  await h.svc.create(merchant, {
    batchId: BATCH,
    fieldId: FIELD,
    action: '施肥',
    recordedAt: '2026-07-17T01:02:03.000Z',
    source: 'miniapp',
    supplyId: '11111111-1111-4111-8111-111111111111',
    supplyAmount: 10,
  });
  expect(h.published.data.sourceFarmRecordId).toBe('fr1');
});

it('publication failure rejects completed creation', async () => {
  const h = makeService({ publishError: true });
  await expect(h.svc.create(merchant, {
    batchId: BATCH,
    fieldId: FIELD,
    action: '施肥',
    recordedAt: '2026-07-17T01:02:03.000Z',
    source: 'miniapp',
  })).rejects.toThrow('publish failed');
});
```

Update the existing lock-order test's custom transaction client so publication is part of the asserted order:

```typescript
(h.svc as any).prisma.$transaction = async (fn: any) => fn({
  $queryRaw: async (strings: TemplateStringsArray) => {
    const sql = String(strings[0]);
    calls.push(sql.includes('batches') ? 'lock-batch' : 'lock-supply');
    return [{ id: sql.includes('batches') ? BATCH : 'sup1' }];
  },
  supplyIssue: { aggregate: async () => ({ _sum: { amount: 100 } }) },
  farmRecord: {
    aggregate: async () => ({ _sum: { supplyAmount: 0 } }),
    create: async (args: any) => {
      calls.push('create-record');
      return { id: 'fr1', ...args.data };
    },
  },
  traceEvent: {
    create: async () => {
      calls.push('publish-event');
      return { id: 'te1' };
    },
  },
});

expect(calls).toEqual(['lock-batch', 'lock-supply', 'create-record', 'publish-event']);
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.service.spec.ts
```

Expected: new tests fail because completed creation does not use a transaction or call `traceEvent.create`.

- [ ] **Step 3: Implement one transactional create path**

Add `buildFarmRecordTraceEventData` to the existing import from `./farm-record.model`, then add this helper and replace `create` with the complete unified implementation:

```typescript
private async createAndPublish(
  tx: Prisma.TransactionClient,
  data: Prisma.FarmRecordUncheckedCreateInput,
  context: { ownerDisplayName: string; fieldName: string },
) {
  const created = await tx.farmRecord.create({ data });
  if (created.status === 'completed') {
    await tx.traceEvent.create({
      data: buildFarmRecordTraceEventData({ record: created, ...context }),
    });
  }
  return created;
}

async create(user: AuthUser, dto: CreateFarmRecordDto) {
  await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
  await this.scope.assertInScope(this.prisma, user, 'field', dto.fieldId);
  const batch = await this.prisma.batch.findFirst({
    where: { id: dto.batchId, tenantId: user.tenantId, fieldId: dto.fieldId },
    select: {
      id: true,
      ownerId: true,
      owner: { select: { displayName: true } },
      field: { select: { name: true } },
    },
  });
  if (!batch) throw new ForbiddenException('地块不属于该批次,拒绝创建农事记录');

  const data = buildFarmRecordCreateData({
    tenantId: user.tenantId,
    operatorId: user.userId,
    dto,
  });

  if (shouldApplySupplyQuota(dto)) {
    const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const supply = await this.prisma.supply.findFirst({
      where: { id: dto.supplyId, ...(scopeWhere as object) } as Prisma.SupplyWhereInput,
      select: { id: true, ownerId: true },
    });
    if (!supply) throw new ForbiddenException('农资不在可操作范围内');
    if (supply.ownerId !== batch.ownerId) {
      throw new ForbiddenException('农资不属于该批次归属商家,拒绝核销');
    }
  }

  const context = {
    ownerDisplayName: batch.owner.displayName,
    fieldName: batch.field.name,
  };
  const created = await this.prisma.$transaction(async (tx) => {
    if (shouldApplySupplyQuota(dto)) {
      await tx.$queryRaw`SELECT id FROM batches WHERE id = ${dto.batchId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM supplies WHERE id = ${dto.supplyId} FOR UPDATE`;
      const quotaAgg = await tx.supplyIssue.aggregate({
        where: { tenantId: user.tenantId, batchId: dto.batchId, supplyId: dto.supplyId },
        _sum: { amount: true },
      });
      const consumedAgg = await tx.farmRecord.aggregate({
        where: { tenantId: user.tenantId, batchId: dto.batchId, supplyId: dto.supplyId },
        _sum: { supplyAmount: true },
      });
      assertSupplyQuotaWithinLimit({
        quota: quotaAgg._sum.amount ?? 0,
        consumed: consumedAgg._sum.supplyAmount ?? 0,
        requested: dto.supplyAmount!,
      });
    }
    return this.createAndPublish(tx, data, context);
  });
  return serializeFarmRecord(created);
}
```

- [ ] **Step 4: Run service and model tests and verify GREEN**

```powershell
pnpm.cmd --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts src/modules/farm-record/farm-record.service.spec.ts
```

Expected: both test files pass, including existing quota and lock-order tests.

- [ ] **Step 5: Commit completed-create publication**

```powershell
git add packages/backend/src/modules/farm-record/farm-record.service.ts packages/backend/src/modules/farm-record/farm-record.service.spec.ts
git commit -m "feat(trace): publish completed farm records"
```

---

### Task 4: Enforce Idempotent Forward-Only Completion

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`

**Interfaces:**
- Consumes: `buildFarmRecordTraceEventData` and the unique source relation.
- Produces: pending-to-completed atomic publication, completed-to-completed no-op, and completed-to-pending rejection.

- [ ] **Step 1: Add a dedicated status-service test helper**

Change the Vitest import to `import { describe, it, expect, vi } from 'vitest';`, then add a helper that captures update and event calls without returning the included `batch`/`field` relations from the service result:

```typescript
function makeStatusService(overrides: { status?: 'pending' | 'completed'; publishError?: boolean } = {}) {
  const recordScalars = {
    id: 'fr-status',
    tenantId: 't1',
    batchId: BATCH,
    fieldId: FIELD,
    operatorId: 'u1',
    action: '除草',
    detail: { desc: '完成除草' },
    images: null,
    location: null,
    recordedAt: new Date('2026-07-17T01:02:03.000Z'),
    source: 'web',
    status: overrides.status ?? 'pending',
    supplyId: null,
    supplyAmount: null,
    createdAt: new Date('2026-07-17T01:02:03.000Z'),
  };
  const current = {
    ...recordScalars,
    batch: { owner: { displayName: '示范农场' } },
    field: { name: '一号地块' },
  };
  const traceEventCreate = vi.fn(async (_args: any) => {
    if (overrides.publishError) throw new Error('publish failed');
    return { id: 'te-status' };
  });
  const farmRecordUpdate = vi.fn(async () => ({ ...recordScalars, status: 'completed' }));
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: current.id }]),
    farmRecord: { findFirst: vi.fn(async () => current), update: farmRecordUpdate },
    traceEvent: { create: traceEventCreate },
  };
  const prisma = {
    farmRecord: { findFirst: vi.fn(async () => ({ id: current.id, batchId: BATCH })) },
    batch: { findFirst: vi.fn(async () => ({ id: BATCH })) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { svc: new FarmRecordService(prisma as any, new ScopeService()), tx, traceEventCreate, farmRecordUpdate };
}
```

- [ ] **Step 2: Write the failing state-machine tests**

```typescript
describe('FarmRecordService.updateStatus 自动发布', () => {
  it('pending to completed updates and publishes once', async () => {
    const h = makeStatusService({ status: 'pending' });
    const result = await h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' });
    expect(result.status).toBe('completed');
    expect(h.farmRecordUpdate).toHaveBeenCalledTimes(1);
    expect(h.traceEventCreate).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('batch');
    expect(result).not.toHaveProperty('field');
  });

  it('repeated completed is an idempotent no-op', async () => {
    const h = makeStatusService({ status: 'completed' });
    const result = await h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' });
    expect(result.status).toBe('completed');
    expect(h.farmRecordUpdate).not.toHaveBeenCalled();
    expect(h.traceEventCreate).not.toHaveBeenCalled();
  });

  it('completed to pending is rejected', async () => {
    const h = makeStatusService({ status: 'completed' });
    await expect(h.svc.updateStatus(merchant, 'fr-status', { status: 'pending' }))
      .rejects.toThrow('已完成农事记录不可退回待完成');
    expect(h.traceEventCreate).not.toHaveBeenCalled();
  });

  it('publication failure rolls back completion', async () => {
    const h = makeStatusService({ status: 'pending', publishError: true });
    await expect(h.svc.updateStatus(merchant, 'fr-status', { status: 'completed' }))
      .rejects.toThrow('publish failed');
  });
});
```

- [ ] **Step 3: Run service tests and verify RED**

Run the Task 3 service-test command.

Expected: tests fail because the current method permits reverse transitions and does not publish.

- [ ] **Step 4: Implement locked forward-only completion**

Import `BadRequestException` and `buildFarmRecordTraceEventData`, then replace `updateStatus` with this interactive transaction. Destructure the included relations before every return so the existing serialized response shape stays unchanged:

```typescript
async updateStatus(user: AuthUser, id: string, dto: UpdateFarmRecordStatusDto) {
  const scoped = await this.prisma.farmRecord.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, batchId: true },
  });
  if (!scoped) throw new ForbiddenException('农事记录不在可操作范围内');
  await this.scope.assertInScope(this.prisma, user, 'batch', scoped.batchId);

  const updated = await this.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM farm_records WHERE id = ${id} FOR UPDATE`;
    const current = await tx.farmRecord.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        batch: { select: { owner: { select: { displayName: true } } } },
        field: { select: { name: true } },
      },
    });
    if (!current) throw new ForbiddenException('农事记录不在可操作范围内');
    const { batch, field, ...record } = current;
    if (current.status === 'completed') {
      if (dto.status === 'pending') throw new BadRequestException('已完成农事记录不可退回待完成');
      return record;
    }
    if (dto.status === 'pending') return record;
    const completed = await tx.farmRecord.update({ where: { id }, data: { status: 'completed' } });
    await tx.traceEvent.create({
      data: buildFarmRecordTraceEventData({
        record: completed,
        ownerDisplayName: batch.owner.displayName,
        fieldName: field.name,
      }),
    });
    return completed;
  });
  return serializeFarmRecord(updated);
}
```

- [ ] **Step 5: Run focused and full backend unit tests**

```powershell
pnpm.cmd --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.service.spec.ts
pnpm.cmd --filter @nongchang/backend test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit the state machine**

```powershell
git add packages/backend/src/modules/farm-record/farm-record.service.ts packages/backend/src/modules/farm-record/farm-record.service.spec.ts
git commit -m "fix(records): make completion atomic and forward only"
```

---

### Task 5: Make Web Completion Feedback Truthful

**Files:**
- Modify: `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`
- Modify: `packages/web/src/components/FarmRecords.tsx`

**Interfaces:**
- Consumes: unchanged `updateFarmRecordStatus(id, 'completed')` API.
- Produces: user-visible confirmation `已完成并发布到公开溯源`.

- [ ] **Step 1: Change the UI test expectation first**

After clicking the completion action in `FarmRecords.fluent-ui.spec.tsx`, assert:

```typescript
expect(await screen.findByText('已完成并发布到公开溯源')).toBeTruthy();
```

- [ ] **Step 2: Run the Web test and verify RED**

```powershell
pnpm.cmd --filter web exec vitest run src/components/FarmRecords.fluent-ui.spec.tsx
```

Expected: FAIL because the current toast says `已标记完成并归档`.

- [ ] **Step 3: Update the success copy**

In `handleComplete`:

```typescript
await updateFarmRecordStatus(id, 'completed');
showToast('已完成并发布到公开溯源');
void reload();
```

- [ ] **Step 4: Run the focused Web test and verify GREEN**

Run the Task 5 command again.

Expected: the test passes.

- [ ] **Step 5: Commit the feedback change**

```powershell
git add packages/web/src/components/FarmRecords.tsx packages/web/src/components/FarmRecords.fluent-ui.spec.tsx
git commit -m "fix(records): confirm automatic trace publication"
```

---

### Task 6: Prove the Closed Loop Against PostgreSQL

**Files:**
- Create: `packages/backend/test/farm-record-publication.e2e-spec.ts`
- Modify: `packages/backend/test/supply.e2e-spec.ts`

**Interfaces:**
- Consumes: real auth, farm-record, status, public-trace, Prisma, and migration behavior.
- Produces: an E2E contract proving private pending records, automatic completed publication, idempotency, and redaction.

- [ ] **Step 1: Write the database E2E specification**

Create a self-cleaning test with these exact behaviors:

```typescript
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Farm record automatic public trace e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let batchId: string;
  let fieldId: string;
  let code: string | undefined;
  let pendingRecordId: string | undefined;
  let completedRecordId: string | undefined;
  let merchantId: string | undefined;
  let originalGroupId: string | null | undefined;
  let testGroupId: string | undefined;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    const merchant = await prisma.user.findUniqueOrThrow({
      where: { tenantId_username: { tenantId: tenant.id, username: 'merchantA' } },
    });
    merchantId = merchant.id;
    originalGroupId = merchant.groupId;
    const batch = await prisma.batch.findFirstOrThrow({ where: { tenantId: tenant.id, ownerId: merchant.id } });
    batchId = batch.id;
    fieldId = batch.fieldId;
    const group = await prisma.userGroup.create({
      data: {
        tenantId: tenant.id,
        name: `e2e自动公开权限组-${randomUUID()}`,
        isDefault: false,
        permissions: ['record:create', 'record:view', 'field:view', 'batch:view', 'trace:view'],
      },
    });
    testGroupId = group.id;
    await prisma.user.update({ where: { id: merchant.id }, data: { groupId: group.id } });
    token = (await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantCode: 'DEMO', username: 'merchantA', password: 'password123',
    }).expect(201)).body.accessToken;
    code = `E2E-${randomUUID()}`;
    await prisma.traceCode.create({ data: { tenantId: merchant.tenantId, batchId, code } });
  });

  afterAll(async () => {
    if (prisma) {
      if (code) {
        await prisma.traceScan.deleteMany({ where: { code } });
        await prisma.traceCode.deleteMany({ where: { code } });
      }
      const ids = [pendingRecordId, completedRecordId].filter((id): id is string => Boolean(id));
      if (ids.length) {
        await prisma.traceEvent.deleteMany({ where: { sourceFarmRecordId: { in: ids } } });
        await prisma.farmRecord.deleteMany({ where: { id: { in: ids } } });
      }
      if (merchantId) await prisma.user.update({ where: { id: merchantId }, data: { groupId: originalGroupId ?? null } });
      if (testGroupId) await prisma.userGroup.delete({ where: { id: testGroupId } });
    }
    if (app) await app.close();
  });

  it('publishes completed records, delays pending records, and never leaks private fields', async () => {
    const completed = await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${token}`)
      .send({
        batchId, fieldId, action: 'e2e自动发布施肥',
        detail: { note: '叶面追肥完成', cost: 999, labor: 8, material: '内部配方' },
        images: ['https://cdn.example/e2e-farm.jpg'],
        location: '100.123456,25.123456',
        recordedAt: '2026-07-17T01:02:03.000Z', source: 'miniapp',
      }).expect(201);
    completedRecordId = completed.body.id;

    const pending = await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${token}`)
      .send({
        batchId, fieldId, action: 'e2e待完成除草', detail: { desc: '计划除草', cost: 123 },
        recordedAt: '2026-07-17T02:02:03.000Z', source: 'web', status: 'pending',
      }).expect(201);
    pendingRecordId = pending.body.id;

    const before = await request(app.getHttpServer()).get(`/api/public/trace/${code}`).expect(200);
    expect(before.body.events.some((event: any) => event.title === 'e2e自动发布施肥')).toBe(true);
    expect(before.body.events.some((event: any) => event.title === 'e2e待完成除草')).toBe(false);
    const publishedEvent = before.body.events.find((event: any) => event.title === 'e2e自动发布施肥');
    expect(publishedEvent).toMatchObject({
      type: 'farm',
      location: 'A区露地',
      payload: { desc: '叶面追肥完成', image: 'https://cdn.example/e2e-farm.jpg' },
    });
    expect(publishedEvent).not.toHaveProperty('sourceFarmRecordId');
    const publicJson = JSON.stringify(publishedEvent);
    expect(publicJson).toContain('叶面追肥完成');
    expect(publicJson).toContain('e2e-farm.jpg');
    expect(publicJson).not.toContain(completedRecordId!);
    expect(publicJson).not.toContain('999');
    expect(publicJson).not.toContain('labor');
    expect(publicJson).not.toContain('内部配方');
    expect(publicJson).not.toContain('100.123456');

    await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/farm-records/${pendingRecordId}/status`)
        .set('Authorization', `Bearer ${token}`).send({ status: 'completed' }).expect(200),
      request(app.getHttpServer())
        .patch(`/api/farm-records/${pendingRecordId}/status`)
        .set('Authorization', `Bearer ${token}`).send({ status: 'completed' }).expect(200),
    ]);

    const after = await request(app.getHttpServer()).get(`/api/public/trace/${code}`).expect(200);
    expect(after.body.events.filter((event: any) => event.title === 'e2e待完成除草')).toHaveLength(1);
    expect(await prisma.traceEvent.count({ where: { sourceFarmRecordId: pendingRecordId } })).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/farm-records/${completedRecordId}/status`)
      .set('Authorization', `Bearer ${token}`).send({ status: 'pending' }).expect(400);
  });
});
```

- [ ] **Step 2: Make existing supply E2E cleanup relation-aware**

The fixture currently reassigns both demo merchants to a test group. Capture their original group IDs before that update and restore them in `afterAll`; otherwise this test changes the shared demo account for later suites. Replace the setup declarations and teardown with this complete shape:

```typescript
let userAId: string | undefined;
let userBId: string | undefined;
let originalGroupIds: { userA: string | null; userB: string | null } | undefined;

// in beforeAll, before assigning the test group
const userA = await prisma.user.findFirstOrThrow({ where: { username: 'merchantA' } });
const userB = await prisma.user.findFirstOrThrow({ where: { username: 'merchantB' } });
userAId = userA.id;
userBId = userB.id;
originalGroupIds = { userA: userA.groupId, userB: userB.groupId };

// in afterAll
if (prisma) {
  if (createdSupplyIds.length) {
    await prisma.supplyIssue.deleteMany({ where: { supplyId: { in: createdSupplyIds } } });
    const records = await prisma.farmRecord.findMany({
      where: { supplyId: { in: createdSupplyIds } },
      select: { id: true },
    });
    await prisma.traceEvent.deleteMany({
      where: { sourceFarmRecordId: { in: records.map((record) => record.id) } },
    });
    await prisma.farmRecord.deleteMany({ where: { supplyId: { in: createdSupplyIds } } });
    await prisma.supply.deleteMany({ where: { id: { in: createdSupplyIds } } });
  }
  if (userAId && userBId && originalGroupIds) {
    await prisma.user.updateMany({ data: { groupId: originalGroupIds.userA }, where: { id: userAId } });
    await prisma.user.updateMany({ data: { groupId: originalGroupIds.userB }, where: { id: userBId } });
  }
}
if (app) await app.close();
```

- [ ] **Step 3: Run the E2E test and verify the pre-migration database fails cleanly if not prepared**

```powershell
pnpm.cmd --filter @nongchang/backend exec tsx test/check-e2e-db.ts
```

Expected: exit 0 only when the disposable PostGIS E2E database is configured. If it fails, stop and prepare the repository's documented E2E database before continuing.

- [ ] **Step 4: Deploy migrations and run focused E2E**

```powershell
pnpm.cmd --filter @nongchang/backend prisma:deploy
pnpm.cmd --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/farm-record-publication.e2e-spec.ts test/supply.e2e-spec.ts test/public-trace.e2e-spec.ts
```

Expected: all focused E2E tests pass against PostgreSQL/PostGIS.

- [ ] **Step 5: Commit E2E coverage**

```powershell
git add packages/backend/test/farm-record-publication.e2e-spec.ts packages/backend/test/supply.e2e-spec.ts
git commit -m "test(trace): cover farm record publication loop"
```

---

### Task 7: Run Completion Gates and Review the Diff

**Files:**
- Verify all files changed in Tasks 1-6.
- Do not modify `packages/web/src/api/trace.spec.ts`.

**Interfaces:**
- Consumes: complete P0-1 implementation.
- Produces: verified, reviewable branch state ready for the next P0 subproject.

- [ ] **Step 1: Run formatting and whitespace checks**

```powershell
git diff --check
```

Expected: exit 0.

- [ ] **Step 2: Run targeted unit gates**

```powershell
pnpm.cmd --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts src/modules/farm-record/farm-record.service.spec.ts src/modules/public-trace/public-trace.service.spec.ts
pnpm.cmd --filter web exec vitest run src/components/FarmRecords.fluent-ui.spec.tsx src/components/TraceabilityPage.spec.tsx
pnpm.cmd --filter @nongchang/miniapp exec vitest run src/components/RecordForm/payload.spec.ts src/pages/trace/truthfulness.spec.ts
```

Expected: all targeted tests pass.

- [ ] **Step 3: Run repository local verification**

```powershell
pnpm.cmd verify:local
```

Expected: shared build, backend build, Web lint, and all backend/Web/miniapp unit suites pass.

- [ ] **Step 4: Run production artifact builds**

Use valid non-secret build-time values:

```powershell
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
pnpm.cmd --filter web build
pnpm.cmd --filter @nongchang/miniapp build:weapp
```

Expected: Web and miniapp production builds exit 0.

- [ ] **Step 5: Run full database E2E gate**

```powershell
pnpm.cmd verify:production
```

Expected: all E2E specifications pass against the prepared PostGIS database. If infrastructure is unavailable, report this gate as blocked rather than claiming production verification.

- [ ] **Step 6: Inspect scope and history**

```powershell
git status --short
git diff --stat HEAD~6..HEAD
git log -7 --oneline
```

Expected:

- only planned P0-1 files plus the pre-existing unstaged `packages/web/src/api/trace.spec.ts` appear;
- no unrelated source or generated artifact is committed;
- each task has its own focused commit.

- [ ] **Step 7: Request code review before starting P0-2**

Review specifically for:

- transaction rollback guarantees;
- concurrent completion idempotency;
- tenant and ownership boundaries;
- public-field leakage;
- migration and deletion ordering;
- compatibility with public and miniapp trace readers.

Do not start the QR-delivery subproject until P0-1 review findings are resolved and all available gates are green.
