# P21 Agent Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic agent management helpers from `AgentService` so list projection, update/status data, merchant scope where clauses, and pagination parameters are directly tested.

**Architecture:** `AgentService` remains responsible for Prisma reads/writes, transactions, `ForbiddenException`, and controller-facing behavior. A new `agent.model.ts` owns pure where/select/data/projection helpers with no database side effects. Existing agent service tests contain mojibake descriptions and sample values; repair those while preserving assertions.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` agent DTO, role, list query, and pagination types.

## Global Constraints

- Do not change `AgentController` routes, DTO schemas, API response shape, Prisma operation shape, transaction boundaries, role permissions, or exception messages.
- Preserve non-paginated default safety cap: `500`.
- Preserve agent list projection: `id`, `name`, `region`, `status`, `createdAt` ISO string, `merchantCount` from `_count.users`.
- Preserve agent list merchant count filter: count users where `role: Role.MERCHANT` and `status: { not: 'pending' }`.
- Preserve `listMerchants` scope: system admin sees all tenant merchants; agent admin must have `agentId` and sees only merchants under that `agentId`.
- Preserve agent admin missing-agent exception: `代理管理员缺少 agentId,拒绝访问`.
- Preserve update validation in service: missing id throws `缺少代理商 id`; out-of-scope target throws `代理商不存在或不在可管理范围`.
- Preserve update data behavior: include `name` only when `dto.name !== undefined`; include `region` only when `dto.region !== undefined`.
- Preserve status behavior: status update data is `{ status }`; when status is `suspended`, service still increments `sessionVersion` for users assigned to that agent in the same transaction.
- Repair mojibake only in `packages/backend/src/modules/agent/agent.service.spec.ts`; do not alter assertions except replacing corrupted sample strings with readable equivalent strings.

---

## File Structure

- Create `packages/backend/src/modules/agent/agent.model.ts`
  - Pure helpers for list select objects, list item projection, scoped merchant where clauses, update data, status data, and pagination params.
- Create `packages/backend/src/modules/agent/agent.model.spec.ts`
  - Direct helper tests for projection, where/data builders, and pagination params.
- Modify `packages/backend/src/modules/agent/agent.service.ts`
  - Replace inline pure logic with imports from `agent.model.ts`.
- Modify `packages/backend/src/modules/agent/agent.service.spec.ts`
  - Repair corrupted Chinese test descriptions and sample values.

---

### Task 1: Add Agent Model Tests

**Files:**
- Create: `packages/backend/src/modules/agent/agent.model.spec.ts`

**Interfaces:**
- Future exports:
  - `DEFAULT_AGENT_LIST_CAP`
  - `AGENT_LIST_SELECT`
  - `MERCHANT_LIST_SELECT`
  - `buildAgentCreateData(user: AuthUser, dto: CreateAgentDto)`
  - `buildAgentListWhere(user: AuthUser)`
  - `buildAgentListItem(row: AgentListRow)`
  - `buildAgentUpdateData(dto: UpdateAgentDto): Record<string, unknown>`
  - `buildAgentStatusUpdateData(status: 'active' | 'suspended')`
  - `buildAgentSessionRevocationWhere(user: AuthUser, agentId: string)`
  - `buildMerchantListWhere(user: AuthUser): Record<string, string> | null`
  - `buildPagination(query?: ListQuery): { paginated: boolean; page: number; pageSize: number; skip: number; take: number }`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/agent/agent.model.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  AGENT_LIST_SELECT,
  DEFAULT_AGENT_LIST_CAP,
  MERCHANT_LIST_SELECT,
  buildAgentCreateData,
  buildAgentListItem,
  buildAgentListWhere,
  buildAgentSessionRevocationWhere,
  buildAgentStatusUpdateData,
  buildAgentUpdateData,
  buildMerchantListWhere,
  buildPagination,
} from './agent.model';

const baseUser: AuthUser = {
  userId: 'u1',
  tenantId: 't1',
  role: Role.SYSTEM_ADMIN,
  agentId: null,
  ownerId: null,
};

describe('agent model helpers', () => {
  it('builds agent create and list data', () => {
    expect(DEFAULT_AGENT_LIST_CAP).toBe(500);
    expect(AGENT_LIST_SELECT).toEqual({
      id: true,
      name: true,
      region: true,
      status: true,
      createdAt: true,
      _count: { select: { users: { where: { role: Role.MERCHANT, status: { not: 'pending' } } } } },
    });
    expect(buildAgentCreateData(baseUser, { name: '华东代理', region: '华东' })).toEqual({
      tenantId: 't1',
      name: '华东代理',
      region: '华东',
    });
    expect(buildAgentListWhere(baseUser)).toEqual({ tenantId: 't1' });
  });

  it('projects agent list rows with merchant count', () => {
    expect(buildAgentListItem({
      id: 'a1',
      name: '华东代理',
      region: '华东',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { users: 5 },
    })).toEqual({
      id: 'a1',
      name: '华东代理',
      region: '华东',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      merchantCount: 5,
    });
  });

  it('builds sparse update and status data', () => {
    expect(buildAgentUpdateData({ name: '新代理' })).toEqual({ name: '新代理' });
    expect(buildAgentUpdateData({ region: '华南' })).toEqual({ region: '华南' });
    expect(buildAgentUpdateData({ name: '新代理', region: '华南' })).toEqual({ name: '新代理', region: '华南' });
    expect(buildAgentUpdateData({})).toEqual({});
    expect(buildAgentStatusUpdateData('suspended')).toEqual({ status: 'suspended' });
    expect(buildAgentSessionRevocationWhere(baseUser, 'a1')).toEqual({ tenantId: 't1', agentId: 'a1' });
  });

  it('builds merchant list scope where clauses', () => {
    expect(MERCHANT_LIST_SELECT).toEqual({
      id: true,
      username: true,
      role: true,
      agentId: true,
      displayName: true,
    });
    expect(buildMerchantListWhere(baseUser)).toEqual({ tenantId: 't1', role: Role.MERCHANT });
    expect(buildMerchantListWhere({ ...baseUser, role: Role.AGENT_ADMIN, agentId: 'a1' })).toEqual({
      tenantId: 't1',
      role: Role.MERCHANT,
      agentId: 'a1',
    });
    expect(buildMerchantListWhere({ ...baseUser, role: Role.AGENT_ADMIN, agentId: null })).toBeNull();
  });

  it('builds pagination parameters with legacy non-paginated cap', () => {
    expect(buildPagination()).toEqual({ paginated: false, page: 1, pageSize: 20, skip: 0, take: 500 });
    expect(buildPagination({ page: 2, pageSize: 10 })).toEqual({
      paginated: true,
      page: 2,
      pageSize: 10,
      skip: 10,
      take: 10,
    });
    expect(buildPagination({ page: 3 })).toEqual({ paginated: true, page: 3, pageSize: 20, skip: 40, take: 20 });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/agent/agent.model.spec.ts
```

Expected: FAIL because `./agent.model` does not exist.

---

### Task 2: Implement Agent Model Helpers

**Files:**
- Create: `packages/backend/src/modules/agent/agent.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Create `packages/backend/src/modules/agent/agent.model.ts`:

```typescript
import { Role, type AuthUser, type CreateAgentDto, type ListQuery, type UpdateAgentDto } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';

export const DEFAULT_AGENT_LIST_CAP = 500;

export const AGENT_LIST_SELECT = {
  id: true,
  name: true,
  region: true,
  status: true,
  createdAt: true,
  _count: { select: { users: { where: { role: Role.MERCHANT, status: { not: 'pending' } } } } },
} as const;

export const MERCHANT_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  agentId: true,
  displayName: true,
} as const;

export interface AgentListRow {
  id: string;
  name: string;
  region: string;
  status: string;
  createdAt: Date;
  _count: { users: number };
}

export function buildAgentCreateData(user: AuthUser, dto: CreateAgentDto) {
  return { tenantId: user.tenantId, ...dto };
}

export function buildAgentListWhere(user: AuthUser) {
  return { tenantId: user.tenantId };
}

export function buildAgentListItem(row: AgentListRow) {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    merchantCount: row._count.users,
  };
}

export function buildAgentUpdateData(dto: UpdateAgentDto): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.region !== undefined) data.region = dto.region;
  return data;
}

export function buildAgentStatusUpdateData(status: 'active' | 'suspended') {
  return { status };
}

export function buildAgentSessionRevocationWhere(user: AuthUser, agentId: string) {
  return { tenantId: user.tenantId, agentId };
}

export function buildMerchantListWhere(user: AuthUser): Record<string, string> | null {
  const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
  if (user.role === Role.AGENT_ADMIN) {
    if (!user.agentId) return null;
    where.agentId = user.agentId;
  }
  return where;
}

export function buildPagination(query?: ListQuery) {
  const paginated = isPaginated(query);
  const page = paginated ? query.page ?? 1 : 1;
  const pageSize = paginated ? query.pageSize ?? 20 : 20;
  return {
    paginated,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: paginated ? pageSize : DEFAULT_AGENT_LIST_CAP,
  };
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/agent/agent.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire AgentService and Repair Test Text

**Files:**
- Modify: `packages/backend/src/modules/agent/agent.service.ts`
- Modify: `packages/backend/src/modules/agent/agent.service.spec.ts`

**Interfaces:**
- Consumes helpers from `./agent.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  AGENT_LIST_SELECT,
  MERCHANT_LIST_SELECT,
  buildAgentCreateData,
  buildAgentListItem,
  buildAgentListWhere,
  buildAgentSessionRevocationWhere,
  buildAgentStatusUpdateData,
  buildAgentUpdateData,
  buildMerchantListWhere,
  buildPagination,
} from './agent.model';
```

Replace:
- `DEFAULT_LIST_CAP` with `buildPagination().take` through helper usage.
- `create` data with `buildAgentCreateData(user, dto)`.
- Agent `where` with `buildAgentListWhere(user)`.
- Agent `select` with `AGENT_LIST_SELECT`.
- `toItem` projection with `buildAgentListItem`.
- pagination page/pageSize/skip/take calculations with `buildPagination(query)`.
- update data construction with `buildAgentUpdateData(dto)`.
- status update data with `buildAgentStatusUpdateData(status)`.
- session revocation where with `buildAgentSessionRevocationWhere(user, id)`.
- merchant `where` with `buildMerchantListWhere(user)`, preserving service throw if helper returns `null`.
- merchant `select` with `MERCHANT_LIST_SELECT`.

Keep:
- `ForbiddenException('缺少代理商 id')`.
- `ForbiddenException('代理商不存在或不在可管理范围')`.
- `ForbiddenException('代理管理员缺少 agentId,拒绝访问')`.
- Existing Prisma method names, orderBy values, transaction boundaries, count calls, and return shapes.

- [ ] **Step 2: Repair mojibake in service tests**

In `packages/backend/src/modules/agent/agent.service.spec.ts`, repair corrupted test descriptions and sample values:

```typescript
it('agent_admin 仅查询自己 agentId 下的 merchant', async () => { ... });
it('system_admin 查询全租户 merchant(不限 agentId)', async () => { ... });
it('agent_admin 缺 agentId: 抛 Forbidden(不查库)', () => { ... });
describe('AgentService 管理能力', () => { ... });
it('update 目标不在租户内抛 Forbidden', async () => { ... });
await expect(svc.update(sysAdmin, 'a1', { name: '新代理' }))
prisma.agent.update.mockResolvedValue({ id: 'a1', name: '新代理', region: '华东' });
await svc.update(sysAdmin, 'a1', { name: '新代理', region: '华东' });
expect(... data: { name: '新代理', region: '华东' } ...);
it('update 在租户内则更新', async () => { ... });
it('setStatus 改 status', async () => { ... });
it('list 带 merchantCount', async () => { ... });
{ id: 'a1', name: '代理1', region: '华东', ... }
{ id: 'a2', name: '代理2', region: '华南', ... }
```

- [ ] **Step 3: Run focused agent tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/agent/agent.model.spec.ts src/modules/agent/agent.service.spec.ts
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

Review P21 agent model boundary. Ensure no controller/DTO/query/transaction behavior changed. Verify list select, merchant scope, pagination, update data, status data, session revocation, and repaired test text.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p21-agent-model-boundary.md packages/backend/src/modules/agent/agent.model.ts packages/backend/src/modules/agent/agent.model.spec.ts packages/backend/src/modules/agent/agent.service.ts packages/backend/src/modules/agent/agent.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract agent model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers list projection, select constants, create/update/status data, merchant scope, pagination, session revocation, service wiring, test text repair, focused tests, full verification, review, and commit.
- Placeholder scan: No placeholders beyond the self-review sentence.
- Type consistency: Helper names and signatures are consistent across tasks.
