# P23 Quick Template Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pure quick-template row mapping and Prisma data builders out of `QuickTemplateService` while preserving tenant isolation and CRUD behavior.

**Architecture:** Keep `QuickTemplateService` responsible for Prisma calls, tenant scoping, and `NotFoundException`. Move deterministic row-to-view, create-data, update-data, and tenant where construction into a colocated pure model module with focused unit tests.

**Tech Stack:** NestJS, TypeScript, Vitest, pnpm via `corepack pnpm@10.33.2`, existing `@nongchang/shared` DTO types.

## Global Constraints

- Repository root: `E:\code\nongchang`.
- Branch: `codex/p1-truthful-product-copy`.
- Use CodeGraph before code discovery because `.codegraph/` exists.
- Keep API shape and database writes unchanged.
- No schema migration, no dependency change, no controller route change.
- Run verification before commit: focused quick-template tests, backend build, backend unit tests, diff checks.

---

## File Structure

- Create `packages/backend/src/modules/quick-template/quick-template.model.ts`
  - Owns `QuickTemplateRow`, `buildQuickTemplateView`, `buildQuickTemplateCreateData`, `buildQuickTemplateUpdateData`, and `buildQuickTemplateTenantWhere`.
- Create `packages/backend/src/modules/quick-template/quick-template.model.spec.ts`
  - Tests row serialization, default values, optional field preservation, partial update patching, and tenant where construction.
- Modify `packages/backend/src/modules/quick-template/quick-template.service.ts`
  - Imports model helpers; keeps Prisma calls and `NotFoundException`.
- Modify `packages/backend/src/modules/quick-template/quick-template.service.spec.ts`
  - Clean mojibake descriptions and sample strings; preserve behavior assertions.

---

### Task 1: Quick Template Pure Model

**Files:**
- Create: `packages/backend/src/modules/quick-template/quick-template.model.ts`
- Create: `packages/backend/src/modules/quick-template/quick-template.model.spec.ts`

**Interfaces:**
- Consumes: `QuickTemplateInput`, `QuickTemplateView` from `@nongchang/shared`.
- Produces:
  - `interface QuickTemplateRow`
  - `function buildQuickTemplateView(row: QuickTemplateRow): QuickTemplateView`
  - `function buildQuickTemplateCreateData(input: { tenantId: string; dto: QuickTemplateInput }): Record<string, unknown>`
  - `function buildQuickTemplateUpdateData(dto: QuickTemplateInput): Record<string, unknown>`
  - `function buildQuickTemplateTenantWhere(input: { tenantId: string; id?: string }): Record<string, string>`

- [ ] **Step 1: Write the failing model tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildQuickTemplateCreateData,
  buildQuickTemplateTenantWhere,
  buildQuickTemplateUpdateData,
  buildQuickTemplateView,
  type QuickTemplateRow,
} from './quick-template.model';

const row: QuickTemplateRow = {
  id: 'qt1',
  tenantId: 't1',
  name: '浇水模板',
  action: '浇水',
  note: null,
  cost: null,
  labor: null,
  sort: 0,
  createdAt: new Date('2026-06-14T10:00:00.000Z'),
};

describe('quick-template.model', () => {
  it('serializes a row to the shared view contract', () => {
    expect(buildQuickTemplateView(row)).toEqual({
      id: 'qt1',
      name: '浇水模板',
      action: '浇水',
      note: null,
      cost: null,
      labor: null,
      sort: 0,
      createdAt: '2026-06-14T10:00:00.000Z',
    });
  });

  it('builds create data with nullable defaults', () => {
    expect(buildQuickTemplateCreateData({
      tenantId: 't1',
      dto: { name: '浇水模板', action: '浇水' },
    })).toEqual({
      tenantId: 't1',
      name: '浇水模板',
      action: '浇水',
      note: null,
      cost: null,
      labor: null,
      sort: 0,
    });
  });

  it('builds create data preserving optional values', () => {
    expect(buildQuickTemplateCreateData({
      tenantId: 't1',
      dto: { name: '追肥模板', action: '施肥', note: '尿素', cost: 50, labor: 1, sort: 3 },
    })).toMatchObject({ note: '尿素', cost: 50, labor: 1, sort: 3 });
  });

  it('builds update data only for provided fields', () => {
    expect(buildQuickTemplateUpdateData({ name: 'A2', action: '滴灌', note: '改' })).toEqual({
      name: 'A2',
      action: '滴灌',
      note: '改',
    });
  });

  it('builds tenant where with optional id', () => {
    expect(buildQuickTemplateTenantWhere({ tenantId: 't1' })).toEqual({ tenantId: 't1' });
    expect(buildQuickTemplateTenantWhere({ tenantId: 't1', id: 'qt1' })).toEqual({ tenantId: 't1', id: 'qt1' });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/quick-template/quick-template.model.spec.ts`

Expected: FAIL because `./quick-template.model` does not exist.

- [ ] **Step 3: Implement the model helpers**

```typescript
import type { QuickTemplateInput, QuickTemplateView } from '@nongchang/shared';

export interface QuickTemplateRow {
  id: string;
  tenantId: string;
  name: string;
  action: string;
  note: string | null;
  cost: number | null;
  labor: number | null;
  sort: number;
  createdAt: Date;
}

export function buildQuickTemplateView(row: QuickTemplateRow): QuickTemplateView {
  return {
    id: row.id,
    name: row.name,
    action: row.action,
    note: row.note,
    cost: row.cost,
    labor: row.labor,
    sort: row.sort,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export function buildQuickTemplateCreateData(input: { tenantId: string; dto: QuickTemplateInput }): Record<string, unknown> {
  return {
    tenantId: input.tenantId,
    name: input.dto.name,
    action: input.dto.action,
    note: input.dto.note ?? null,
    cost: input.dto.cost ?? null,
    labor: input.dto.labor ?? null,
    sort: input.dto.sort ?? 0,
  };
}

export function buildQuickTemplateUpdateData(dto: QuickTemplateInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.action !== undefined) data.action = dto.action;
  if (dto.note !== undefined) data.note = dto.note;
  if (dto.cost !== undefined) data.cost = dto.cost;
  if (dto.labor !== undefined) data.labor = dto.labor;
  if (dto.sort !== undefined) data.sort = dto.sort;
  return data;
}

export function buildQuickTemplateTenantWhere(input: { tenantId: string; id?: string }): Record<string, string> {
  return input.id ? { tenantId: input.tenantId, id: input.id } : { tenantId: input.tenantId };
}
```

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/quick-template/quick-template.model.spec.ts`

Expected: PASS, 1 file and 5 tests.

---

### Task 2: Wire QuickTemplateService To The Model

**Files:**
- Modify: `packages/backend/src/modules/quick-template/quick-template.service.ts`
- Modify: `packages/backend/src/modules/quick-template/quick-template.service.spec.ts`

**Interfaces:**
- Consumes model helpers from Task 1.
- Produces unchanged service methods:
  - `list(user): Promise<QuickTemplateView[]>`
  - `create(user, dto): Promise<QuickTemplateView>`
  - `update(user, id, dto): Promise<QuickTemplateView>`
  - `remove(user, id): Promise<void>`

- [ ] **Step 1: Update service imports and remove inline row mapper**

```typescript
import {
  buildQuickTemplateCreateData,
  buildQuickTemplateTenantWhere,
  buildQuickTemplateUpdateData,
  buildQuickTemplateView,
  type QuickTemplateRow,
} from './quick-template.model';
```

- [ ] **Step 2: Replace list mapping**

```typescript
const rows = (await this.prisma.quickTemplate.findMany({
  where: buildQuickTemplateTenantWhere({ tenantId: user.tenantId }),
  orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
})) as QuickTemplateRow[];
return rows.map(buildQuickTemplateView);
```

- [ ] **Step 3: Replace create data and response mapping**

```typescript
const row = (await this.prisma.quickTemplate.create({
  data: buildQuickTemplateCreateData({ tenantId: user.tenantId, dto }),
})) as QuickTemplateRow;
return buildQuickTemplateView(row);
```

- [ ] **Step 4: Replace update tenant lookup, patch builder, and response mapping**

```typescript
const existing = (await this.prisma.quickTemplate.findFirst({
  where: buildQuickTemplateTenantWhere({ tenantId: user.tenantId, id }),
})) as QuickTemplateRow | null;
if (!existing) throw new NotFoundException('快捷模板不存在');

const row = (await this.prisma.quickTemplate.update({
  where: { id },
  data: buildQuickTemplateUpdateData(dto),
})) as QuickTemplateRow;
return buildQuickTemplateView(row);
```

- [ ] **Step 5: Replace remove tenant lookup**

```typescript
const existing = (await this.prisma.quickTemplate.findFirst({
  where: buildQuickTemplateTenantWhere({ tenantId: user.tenantId, id }),
})) as QuickTemplateRow | null;
if (!existing) throw new NotFoundException('快捷模板不存在');
await this.prisma.quickTemplate.delete({ where: { id } });
```

- [ ] **Step 6: Clean service spec mojibake while preserving assertions**

Use readable Chinese descriptions and sample data:

```typescript
it('create + list 按租户隔离并补默认值', async () => {
  await svc.create(user, { name: '浇水', action: '浇水' });
  await svc.create(otherTenant, { name: '别租户', action: '施肥' });
  const list = await svc.list(user);
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('浇水');
  expect(list[0].note).toBeNull();
  expect(list[0].cost).toBeNull();
  expect(list[0].sort).toBe(0);
});
```

- [ ] **Step 7: Run focused service tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/quick-template/quick-template.model.spec.ts src/modules/quick-template/quick-template.service.spec.ts`

Expected: PASS, model and service tests all green.

---

### Task 3: Verification, Review, And Commit

**Files:**
- Stage only P23 files listed above and this plan file.

- [ ] **Step 1: Run backend build**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend build`

Expected: exit 0 after Prisma generate and Nest build.

- [ ] **Step 2: Run backend unit suite**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend test:unit`

Expected: exit 0 with all backend test files passing.

- [ ] **Step 3: Scan modified source files**

Run:

```powershell
Select-String -Path packages/backend/src/modules/quick-template/quick-template.service.ts,packages/backend/src/modules/quick-template/quick-template.service.spec.ts,packages/backend/src/modules/quick-template/quick-template.model.ts,packages/backend/src/modules/quick-template/quick-template.model.spec.ts -Pattern '�|鍔|瘑|浠|绉|鏌|缂|鐩|鏂|鍦|鏀|甯|鍗|绠|悊|疆|閽|熸|涓|澶|宸|浣|瓒|璀|喕||||||'
```

Expected: no matches.

- [ ] **Step 4: Run diff checks**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p23-quick-template-model-boundary.md packages/backend/src/modules/quick-template/quick-template.model.ts packages/backend/src/modules/quick-template/quick-template.model.spec.ts packages/backend/src/modules/quick-template/quick-template.service.ts packages/backend/src/modules/quick-template/quick-template.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
```

Expected: exit 0. LF-to-CRLF warnings on Windows are acceptable if the exit code is 0.

- [ ] **Step 5: Request review**

Dispatch a read-only reviewer for the staged P23 diff. Fix any Critical or Important findings, then rerun focused tests and build.

- [ ] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract quick-template model helpers"
```

Expected: commit created on `codex/p1-truthful-product-copy`.

---

## Self-Review

- Spec coverage: Task 1 covers model extraction and pure unit tests; Task 2 covers service wiring and mojibake cleanup; Task 3 covers verification, review, and commit.
- Placeholder scan: no deferred implementation markers are present.
- Type consistency: helper names and signatures are identical across task interfaces and code snippets.
