# Merchant User Group Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every newly created merchant or member receives a valid tenant-scoped user group, expose that group in merchant management, and keep UI capabilities and cached authorization state consistent with backend policy.

**Architecture:** Extend the shared Zod contracts first, then keep all group lookup/default creation inside `UserGroupService`. `UserService` consumes that service when provisioning grouped roles and projects only `groupId`/`groupName` into merchant list views. The Web client uses the existing `/user-groups/assign` endpoint for edits, while the user-group page derives its edit capability from the authenticated role.

**Tech Stack:** TypeScript 5.8, Zod, NestJS 11, Prisma 6, React 19, Vitest, Testing Library, Supertest, pnpm workspace.

## Global Constraints

- Do not use `using-superpowers`.
- Do not weaken `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `ScopeService`, or database tenant constraints.
- Keep `Role.SYSTEM_ADMIN` as the only role allowed to create, update, or delete user-group definitions.
- Keep `Role.AGENT_ADMIN` limited to listing group definitions and assigning groups to merchants inside its own `tenantId + agentId` scope.
- A supplied group ID must resolve inside the actor's tenant; a group from another tenant is treated as not found and must never be attached.
- New `merchant` and `member` users must receive the requested tenant group or the tenant default group before `prisma.user.create` runs.
- Group assignment must invalidate the target user's session-validation cache immediately after the database update succeeds.
- Do not expose the permissions JSON through merchant list responses; expose only `groupId` and `groupName`.
- Every production-code behavior change starts with a regression test that is observed failing for the expected reason.
- Preserve current `/api` routes and response compatibility; all newly added response fields are additive.
- Do not store or print passwords, tokens, server credentials, payment payloads, or other secrets in source, tests, logs, or plan artifacts.

---

### Task 1: Shared user and merchant group contracts

**Files:**
- Create: `packages/shared/src/dto/entities.dto.spec.ts`
- Modify: `packages/shared/src/dto/entities.dto.ts:4-11`
- Modify: `packages/shared/src/dto/entities.dto.ts:130-151`

**Interfaces:**
- Produces: `CreateUserDto.groupId?: string`, validated as a UUID.
- Produces: `MerchantListItem.groupId: string | null`.
- Produces: `MerchantListItem.groupName: string | null`.
- Preserves: `CreateUserResponse` without exposing the generated group or permissions.

- [ ] **Step 1: Add failing shared-contract tests**

Create `packages/shared/src/dto/entities.dto.spec.ts` with focused parsing assertions:

```ts
import { describe, expect, it } from 'vitest';
import { Role } from '../enums';
import { createUserSchema, merchantListItemSchema } from './entities.dto';

const groupId = '00000000-0000-0000-0000-000000000031';

describe('user group entity contracts', () => {
  it('accepts an optional UUID groupId when creating a grouped user', () => {
    expect(createUserSchema.parse({
      username: 'merchant31',
      role: Role.MERCHANT,
      displayName: 'Merchant 31',
      groupId,
    }).groupId).toBe(groupId);
  });

  it('rejects a malformed create-user groupId', () => {
    expect(createUserSchema.safeParse({
      username: 'merchant32',
      role: Role.MERCHANT,
      displayName: 'Merchant 32',
      groupId: 'not-a-uuid',
    }).success).toBe(false);
  });

  it('parses additive merchant group identity without permissions', () => {
    const parsed = merchantListItemSchema.parse({
      id: 'merchant-31',
      username: 'merchant31',
      displayName: 'Merchant 31',
      phone: null,
      status: 'active',
      agentId: null,
      groupId,
      groupName: '默认用户组',
      createdAt: '2026-07-20T00:00:00.000Z',
      fieldCount: 0,
      totalArea: 0,
    });

    expect(parsed).toMatchObject({ groupId, groupName: '默认用户组' });
    expect(parsed).not.toHaveProperty('permissions');
  });
});
```

- [ ] **Step 2: Run the shared test and confirm RED**

Run:

```powershell
pnpm.cmd --filter @nongchang/shared test -- src/dto/entities.dto.spec.ts
```

Expected: FAIL because strict `createUserSchema` rejects `groupId`, and `merchantListItemSchema` strips or does not return `groupId`/`groupName`.

- [ ] **Step 3: Add the minimal shared fields**

Update the schemas with exactly these additive fields:

```ts
export const createUserSchema = z.object({
  username: z.string().min(3).max(64),
  role: z.enum([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT, Role.MEMBER]),
  agentId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().optional(),
  phone: z.string().max(20).optional(),
  displayName: z.string().max(64),
}).strict();
```

```ts
export const merchantListItemSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  agentId: z.string().nullable(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  createdAt: z.string(),
  fieldCount: z.number(),
  totalArea: z.number(),
});
```

- [ ] **Step 4: Run shared tests and build**

Run:

```powershell
pnpm.cmd --filter @nongchang/shared test -- src/dto/entities.dto.spec.ts
pnpm.cmd --filter @nongchang/shared build
```

Expected: the new test passes and TypeScript emits `dist` without errors.

- [ ] **Step 5: Commit the contract**

```powershell
git add packages/shared/src/dto/entities.dto.ts packages/shared/src/dto/entities.dto.spec.ts
git commit -m "feat(shared): expose merchant user groups"
```

---

### Task 2: Tenant-safe group resolution and cache invalidation

**Files:**
- Modify: `packages/backend/src/modules/user-group/user-group.service.spec.ts:1-145`
- Modify: `packages/backend/src/modules/user-group/user-group.service.ts:1-115`

**Interfaces:**
- Produces: `UserGroupService.resolveForCreate(tenantId: string, requestedGroupId?: string): Promise<string>`.
- Preserves: concurrent-safe `ensureDefault(tenantId)` behavior and the `P2002` winner reread.
- Produces: `SessionValidationCacheService.invalidateUser(tenantId, userId)` after a successful `assignUserGroup` update.

- [ ] **Step 1: Add failing service tests for group resolution**

Extend the in-memory Prisma fixture so groups from both `t1` and `t2` can be inserted. Add these tests:

```ts
it('resolveForCreate returns an explicitly requested group in the same tenant', async () => {
  const group = await svc.create(user, { name: 'Production' });
  await expect(svc.resolveForCreate('t1', group.id)).resolves.toBe(group.id);
});

it('resolveForCreate rejects a group owned by another tenant', async () => {
  const foreign = await svc.create(otherTenant, { name: 'Foreign' });
  await expect(svc.resolveForCreate('t1', foreign.id)).rejects.toBeInstanceOf(NotFoundException);
});

it('resolveForCreate creates and returns the tenant default when groupId is omitted', async () => {
  const groupId = await svc.resolveForCreate('t1');
  expect(groupId).toBe(prisma.groups[0].id);
  expect(prisma.groups[0]).toMatchObject({ tenantId: 't1', isDefault: true });
});
```

- [ ] **Step 2: Add a failing cache-invalidation test**

Initialize the service with a cache spy and verify ordering after persistence:

```ts
const sessions = { invalidateUser: vi.fn().mockResolvedValue(undefined) };
svc = new UserGroupService(prisma, sessions as any);
```

```ts
it('assignUserGroup invalidates the target session cache after update', async () => {
  const group = await svc.create(user, { name: 'A' });
  await svc.assignUserGroup(user, { userId: 'mem1', groupId: group.id });
  expect(prisma.users[0].groupId).toBe(group.id);
  expect(sessions.invalidateUser).toHaveBeenCalledWith('t1', 'mem1');
});
```

- [ ] **Step 3: Run the service test and confirm RED**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend test:unit -- src/modules/user-group/user-group.service.spec.ts
```

Expected: FAIL because `resolveForCreate` does not exist and `assignUserGroup` never calls `invalidateUser`.

- [ ] **Step 4: Implement group resolution and invalidation**

Inject the cache without changing authorization scope:

```ts
constructor(
  private prisma: PrismaService,
  @Optional() private sessions?: SessionValidationCacheService,
) {}
```

Add the imports `Optional` and `SessionValidationCacheService`, then add:

```ts
async resolveForCreate(tenantId: string, requestedGroupId?: string): Promise<string> {
  if (!requestedGroupId) return (await this.ensureDefault(tenantId)).id;
  const group = await this.prisma.userGroup.findFirst({
    where: buildUserGroupTenantWhere({ tenantId, id: requestedGroupId }),
    select: { id: true },
  });
  if (!group) throw new NotFoundException('用户组不存在');
  return group.id;
}
```

After the existing `prisma.user.update` in `assignUserGroup`, add:

```ts
await this.sessions?.invalidateUser(user.tenantId, dto.userId);
```

- [ ] **Step 5: Run user-group tests and backend build**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend test:unit -- src/modules/user-group/user-group.service.spec.ts src/modules/user-group/user-group.controller.spec.ts
pnpm.cmd --filter @nongchang/backend build
```

Expected: both specs pass; the build confirms Nest can resolve the optional cache dependency from the global runtime-state module.

- [ ] **Step 6: Commit group ownership behavior**

```powershell
git add packages/backend/src/modules/user-group/user-group.service.ts packages/backend/src/modules/user-group/user-group.service.spec.ts
git commit -m "fix(backend): close user group assignment state"
```

---

### Task 3: Assign a group during user provisioning and project it in merchant lists

**Files:**
- Modify: `packages/backend/src/modules/user/user.module.ts:1-7`
- Modify: `packages/backend/src/modules/user/user.service.ts:1-159`
- Modify: `packages/backend/src/modules/user/user.model.ts:24-49`
- Modify: `packages/backend/src/modules/user/user.model.ts:127-143`
- Modify: `packages/backend/src/modules/user/user.service.spec.ts:1-310`
- Modify: `packages/backend/src/modules/user/user.model.spec.ts:1-220`
- Modify: `packages/backend/test/merchant-agent-mgmt.e2e-spec.ts:1-55`

**Interfaces:**
- Consumes: `UserGroupService.resolveForCreate(tenantId, requestedGroupId?)` from Task 2.
- Produces: `UserService.create()` writes `groupId` for `Role.MERCHANT` and `Role.MEMBER` before returning the existing create-user response.
- Produces: merchant list Prisma rows include `groupId` and `group.name`; serialized rows include `groupId` and `groupName` only.

- [ ] **Step 1: Add failing provisioning tests**

Add a `groups` mock to `UserService` tests and route all direct service construction through a helper:

```ts
const groups = {
  resolveForCreate: vi.fn().mockResolvedValue('00000000-0000-0000-0000-000000000031'),
};

function makeService(prisma: any, sessions?: any) {
  return new UserService(prisma, new ScopeService(), groups as any, sessions);
}
```

Reset `groups.resolveForCreate` in `beforeEach`, replace direct `new UserService(...)` calls with `makeService(...)`, and add:

```ts
it.each([Role.MERCHANT, Role.MEMBER])('create assigns the tenant default group to %s', async (role) => {
  const prisma = makePrisma();
  prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u31', ...data }));
  const svc = makeService(prisma);

  await svc.create(sysAdmin, { username: `user-${role}`, role, displayName: 'Grouped user' });

  expect(groups.resolveForCreate).toHaveBeenCalledWith('t1', undefined);
  expect(prisma.user.create.mock.calls[0][0].data.groupId).toBe('00000000-0000-0000-0000-000000000031');
});

it('create validates and writes an explicitly selected tenant group', async () => {
  const prisma = makePrisma();
  prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u32', ...data }));
  const svc = makeService(prisma);
  const requested = '00000000-0000-0000-0000-000000000032';
  groups.resolveForCreate.mockResolvedValueOnce(requested);

  await svc.create(sysAdmin, {
    username: 'merchant32', role: Role.MERCHANT, displayName: 'Merchant 32', groupId: requested,
  });

  expect(groups.resolveForCreate).toHaveBeenCalledWith('t1', requested);
  expect(prisma.user.create.mock.calls[0][0].data.groupId).toBe(requested);
});
```

- [ ] **Step 2: Add failing merchant projection tests**

Update the model fixture rows with `groupId` and `group: { name }`, then require:

```ts
expect(MERCHANT_USER_LIST_SELECT).toMatchObject({
  groupId: true,
  group: { select: { name: true } },
});
```

```ts
expect(toMerchantListItems(merchants, aggregates)[0]).toMatchObject({
  groupId: 'g31',
  groupName: '默认用户组',
});
expect(toMerchantListItems(merchants, aggregates)[0]).not.toHaveProperty('group');
```

- [ ] **Step 3: Run focused backend tests and confirm RED**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts src/modules/user/user.model.spec.ts
```

Expected: FAIL because `UserService` does not consume `UserGroupService`, the create data omits `groupId`, and merchant rows omit group identity.

- [ ] **Step 4: Wire `UserGroupModule` into `UserModule`**

Use the existing exported service:

```ts
import { UserGroupModule } from '../user-group/user-group.module';

@Module({
  imports: [UserGroupModule],
  providers: [UserService, ScopeService],
  controllers: [UserController],
})
export class UserModule {}
```

Inject it before the optional session cache:

```ts
constructor(
  private prisma: PrismaService,
  private scope: ScopeService,
  private userGroups: UserGroupService,
  @Optional() private sessions?: SessionValidationCacheService,
) {}
```

- [ ] **Step 5: Resolve grouped roles before creating the user**

Add a small private method and write its result into Prisma data:

```ts
private resolveCreateGroupId(actor: AuthUser, dto: CreateUserDto): Promise<string | null> {
  if (dto.role !== Role.MERCHANT && dto.role !== Role.MEMBER) return Promise.resolve(null);
  return this.userGroups.resolveForCreate(actor.tenantId, dto.groupId);
}
```

In `create`, resolve `groupId` after validating `agentId` and before generating/persisting credentials:

```ts
const groupId = await this.resolveCreateGroupId(actor, dto);
```

Then include `groupId` in `prisma.user.create({ data: ... })`. Import `Role` and `UserGroupService`; do not add `groupId` to the create response select.

- [ ] **Step 6: Add group identity to the internal row and public merchant projection**

Extend `MERCHANT_USER_LIST_SELECT` and `MerchantListRow`:

```ts
groupId: true,
group: { select: { name: true } },
```

```ts
groupId: string | null;
group: { name: string } | null;
```

Return only these flattened fields from `toMerchantListItems`:

```ts
groupId: merchant.groupId,
groupName: merchant.group?.name ?? null,
```

- [ ] **Step 7: Run unit tests and backend build**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts src/modules/user/user.model.spec.ts src/modules/user-group/user-group.service.spec.ts
pnpm.cmd --filter @nongchang/backend build
```

Expected: all focused tests pass and Nest compiles the module dependency graph.

- [ ] **Step 8: Add a first-login E2E regression**

In `merchant-agent-mgmt.e2e-spec.ts`, inject `PrismaService`, create a unique merchant through `POST /api/users`, log in with `initialPassword`, and assert 200 from all permission-protected read routes:

```ts
for (const path of ['/api/fields', '/api/batches', '/api/farm-records', '/api/trace/events']) {
  await request(app.getHttpServer())
    .get(path)
    .set('Authorization', `Bearer ${merchantToken}`)
    .expect(200);
}
```

Also query the created row and assert `groupId` is non-null, assert the merchant list row exposes `groupId`/`groupName`, and delete the temporary user in `finally` so repeated E2E runs do not accumulate accounts.

- [ ] **Step 9: Run the targeted E2E test**

Run:

```powershell
pnpm.cmd --filter @nongchang/backend prisma:generate
pnpm.cmd --filter @nongchang/backend e2e:check-db
pnpm.cmd --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/merchant-agent-mgmt.e2e-spec.ts
```

Expected: database precheck succeeds and the merchant can immediately read fields, batches, farm records, and trace events. If PostgreSQL/PostGIS is unavailable, record this exact environment blocker and keep the unit/build evidence; do not claim E2E success.

- [ ] **Step 10: Commit provisioning closure**

```powershell
git add packages/backend/src/modules/user packages/backend/test/merchant-agent-mgmt.e2e-spec.ts
git commit -m "fix(backend): provision merchants with permissions"
```

---

### Task 4: Merchant group selection and reassignment UI

**Files:**
- Modify: `packages/web/src/components/MerchantManagement.spec.tsx:1-170`
- Modify: `packages/web/src/components/MerchantManagement.tsx:1-318`

**Interfaces:**
- Consumes: `listUserGroups(): Promise<UserGroupView[]>`.
- Consumes: `assignUserGroup({ userId, groupId }): Promise<{ ok: true }>`.
- Consumes: additive `MerchantListItem.groupId` and `MerchantListItem.groupName` fields from Task 1.
- Produces: create requests with `groupId` when a group is selected; edit requests call assignment only when the group changed.

- [ ] **Step 1: Add failing Web tests and mocks**

Mock `../api/user-group` alongside the existing user API:

```ts
const listUserGroupsMock = vi.fn();
const assignUserGroupMock = vi.fn();

vi.mock('../api/user-group', () => ({
  listUserGroups: () => listUserGroupsMock(),
  assignUserGroup: (...args: unknown[]) => assignUserGroupMock(...args),
}));
```

Give merchant fixtures `groupId`/`groupName`, return one default and one alternate group, then add:

```ts
it('creates a merchant with the selected tenant group', async () => {
  renderWithDialog();
  await screen.findByText('North Farm');
  fireEvent.click(screen.getByRole('button', { name: '新增入驻' }));
  fireEvent.change(screen.getByLabelText('企业 / 商户名称'), { target: { value: 'East Farm' } });
  fireEvent.change(screen.getByLabelText('联系人 / 用户名'), { target: { value: 'east-owner' } });
  fireEvent.change(screen.getByLabelText('用户组'), { target: { value: 'group-alt' } });
  fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

  await waitFor(() => expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({
    role: Role.MERCHANT,
    groupId: 'group-alt',
  })));
});
```

```ts
it('reassigns an edited merchant only when its group changes', async () => {
  renderWithDialog();
  await screen.findByText('North Farm');
  fireEvent.click(screen.getByRole('button', { name: '编辑商户 North Farm' }));
  fireEvent.change(screen.getByLabelText('用户组'), { target: { value: 'group-alt' } });
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

  await waitFor(() => expect(assignUserGroupMock).toHaveBeenCalledWith({
    userId: 'merchant-1',
    groupId: 'group-alt',
  }));
});
```

- [ ] **Step 2: Run the component spec and confirm RED**

Run:

```powershell
pnpm.cmd --filter web test -- src/components/MerchantManagement.spec.tsx
```

Expected: FAIL because the dialog has no `用户组` control and never calls the group API.

- [ ] **Step 3: Load groups and extend stable form state**

Add `groupId: string` to `FormState` and `emptyForm`. Load definitions with a separate cache key:

```ts
const { data: groupData, loading: groupsLoading, error: groupsError } = useApi(listUserGroups, {
  cacheKey: 'merchant-user-groups',
});
const groups = groupData ?? [];
```

When opening create, initialize `groupId` to `groups.find(group => group.isDefault)?.id ?? ''`. When opening edit, initialize it to `merchant.groupId ?? ''`.

- [ ] **Step 4: Render group identity and the selection control**

Add a `用户组` table column showing `merchant.groupName ?? '未分组'`. In the create/edit dialog, render a native select with stable sizing:

```tsx
<label htmlFor="merchant-group" className="mb-1.5 block text-sm font-semibold text-[#323130]">用户组</label>
<select
  id="merchant-group"
  value={form.groupId}
  onChange={(event) => setForm({ ...form, groupId: event.target.value })}
  className={`${fluentInput} w-full`}
  disabled={groupsLoading || !!groupsError}
>
  <option value="">自动使用默认用户组</option>
  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.isDefault ? '（默认）' : ''}</option>)}
</select>
```

Display a compact load-error message next to the select when `groupsError` is present; keep the empty option so backend default creation remains available during initial setup.

- [ ] **Step 5: Submit create and edit group changes**

For create, include `groupId` only when non-empty:

```ts
groupId: form.groupId || undefined,
```

For edit, capture the original merchant before updating, then call:

```ts
if ((original.groupId ?? '') !== form.groupId) {
  await assignUserGroup({ userId: editingId, groupId: form.groupId || null });
}
```

Keep the existing `updateUser` profile request and the existing dialog-level error handling. Reload the merchant list only after all requested operations succeed.

- [ ] **Step 6: Run the Web spec and typecheck**

Run:

```powershell
pnpm.cmd --filter web test -- src/components/MerchantManagement.spec.tsx
pnpm.cmd --filter web lint
```

Expected: the component spec passes and TypeScript reports no errors.

- [ ] **Step 7: Commit merchant group management**

```powershell
git add packages/web/src/components/MerchantManagement.tsx packages/web/src/components/MerchantManagement.spec.tsx
git commit -m "feat(web): manage merchant user groups"
```

---

### Task 5: Agent-admin read-only user-group surface

**Files:**
- Modify: `packages/web/src/components/UserGroups.spec.tsx:1-105`
- Modify: `packages/web/src/components/UserGroups.tsx:1-190`

**Interfaces:**
- Consumes: `useAuth().user.role` and shared `Role` values.
- Produces: user-group definition CRUD controls only for `Role.SYSTEM_ADMIN`.
- Preserves: group listing for `Role.AGENT_ADMIN`; merchant reassignment remains in `MerchantManagement`.
- Verifies: existing `UserGroupController` metadata keeps `list`/`assign` available to agent admins and CRUD system-admin-only.

- [ ] **Step 1: Add a failing agent-admin capability test**

Mock authenticated role with system admin as the test default:

```ts
let currentRole = Role.SYSTEM_ADMIN;

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: { role: currentRole } }),
}));
```

Then add:

```ts
it('renders group definitions read-only for agent admins', async () => {
  currentRole = Role.AGENT_ADMIN;
  renderWithDialog();
  await screen.findByText('记录员');

  expect(screen.getByText(/可在商户档案中分配用户组/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /新建用户组/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '编辑 记录员' })).toBeNull();
  expect(screen.queryByRole('button', { name: '删除 记录员' })).toBeNull();
});
```

Reset `currentRole = Role.SYSTEM_ADMIN` in `beforeEach` so existing CRUD tests keep their intended role.

- [ ] **Step 2: Run the user-group component spec and confirm RED**

Run:

```powershell
pnpm.cmd --filter web test -- src/components/UserGroups.spec.tsx
```

Expected: FAIL because agent admins still see create/edit/delete controls.

- [ ] **Step 3: Gate controls by the authenticated capability**

Import `Role` and `useAuth`, then derive:

```ts
const { user } = useAuth();
const canManageGroups = user?.role === Role.SYSTEM_ADMIN;
```

Render the create button, edit button, delete button, and edit modal only when `canManageGroups` is true. For read-only users, render this concise status text in the header:

```tsx
<p className="mt-1 text-sm text-[#605E5C]">可查看当前组定义；可在商户档案中分配用户组。</p>
```

Do not disable visible CRUD buttons: remove unavailable commands from the rendered interaction surface.

- [ ] **Step 4: Run role-boundary tests and Web typecheck**

Run:

```powershell
pnpm.cmd --filter web test -- src/components/UserGroups.spec.tsx
pnpm.cmd --filter @nongchang/backend test:unit -- src/modules/user-group/user-group.controller.spec.ts
pnpm.cmd --filter web lint
```

Expected: Web tests pass for system-admin CRUD and agent-admin read-only behavior; backend metadata tests still prove matching route authorization.

- [ ] **Step 5: Commit truthful capabilities**

```powershell
git add packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx
git commit -m "fix(web): align user group controls with roles"
```

---

### Task 6: Phase verification and review package

**Files:**
- Modify only if a failing verification exposes a phase-1 regression.

**Interfaces:**
- Consumes: all Task 1-5 commits.
- Produces: review evidence for the complete merchant/user-group closure.

- [ ] **Step 1: Run all focused tests together**

Run:

```powershell
pnpm.cmd --filter @nongchang/shared test -- src/dto/entities.dto.spec.ts
pnpm.cmd --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts src/modules/user/user.model.spec.ts src/modules/user-group/user-group.service.spec.ts src/modules/user-group/user-group.controller.spec.ts
pnpm.cmd --filter web test -- src/components/MerchantManagement.spec.tsx src/components/UserGroups.spec.tsx
```

Expected: all focused suites pass with no unhandled errors or warnings.

- [ ] **Step 2: Run package-level regression gates**

Run:

```powershell
pnpm.cmd build:shared
pnpm.cmd build:backend
pnpm.cmd typecheck:web
pnpm.cmd test:unit
```

Expected: shared/backend builds pass, Web typecheck passes, and the complete unit baseline remains green.

- [ ] **Step 3: Run production verification**

Run:

```powershell
pnpm.cmd verify:production
```

Expected: local builds, lint, unit tests, Web/miniapp production builds, production dependency audit, database precheck, and E2E suites pass. If an external database or registry is unavailable, retain the successful local gates and report the exact blocked command/error without describing production verification as complete.

- [ ] **Step 4: Perform task and whole-phase reviews**

For each task, generate a review package from its recorded base commit through its head commit and require both spec-compliance and code-quality approval. After all task reviews are clean, generate a whole-phase package from `df78d84` through `HEAD` and review tenant isolation, grouped-role creation, cache invalidation, response shape, UI capability truthfulness, and regression coverage together.

- [ ] **Step 5: Confirm repository state**

Run:

```powershell
git status --short
git log --oneline df78d84..HEAD
```

Expected: no uncommitted production or test files remain; the log contains the plan and independently reviewable Task 1-5 commits.
