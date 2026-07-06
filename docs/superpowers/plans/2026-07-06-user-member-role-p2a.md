# User Member Role Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `member` role for ordinary users that can exist in tenant data and authenticate safely without gaining merchant/admin operational permissions.

**Architecture:** Treat `member` as a tenant-scoped, non-owner role. Backend auth emits `ownerId: null` for members, tenant admins may create and list members, agent admins stay merchant-only, and merchant-only management APIs continue to exclude members. Web navigation gets a safe member surface so a member login cannot crash or mount merchant/admin modules.

**Tech Stack:** TypeScript, Zod, NestJS, Prisma/PostgreSQL enum migrations, Vitest, React/Vite.

---

## File Structure

- Modify `packages/shared/src/enums/index.ts`
  - Add `Role.MEMBER = 'member'` to the shared role contract.
- Modify `packages/shared/src/dto/entities.dto.ts`
  - Allow `Role.MEMBER` in `createUserSchema.role`.
- Modify `packages/backend/prisma/schema.prisma`
  - Add `member` to the Prisma `Role` enum.
- Create `packages/backend/prisma/migrations/20260706090000_member_role/migration.sql`
  - Add the PostgreSQL enum value in a forward-only migration.
- Modify `packages/backend/src/modules/user/user.service.ts`
  - Normalize `agentId` to `null` for `member`.
  - Keep `agent_admin` creation restricted to `merchant`.
  - Validate agent existence only when a non-null `agentId` remains.
  - Keep pending self-registration review explicitly `merchant`-only so pending members cannot be approved through merchant onboarding.
- Modify `packages/backend/src/modules/user/user.service.spec.ts`
  - Add RED tests for creating and listing members.
  - Add regression tests that members are excluded from merchant-only surfaces.
- Modify `packages/backend/src/auth/auth.service.spec.ts`
  - Add RED tests proving member tokens carry `ownerId: null` for login and refresh.
- Modify `packages/web/src/navigation.ts`
  - Add `member` as a supported web role with settings-only navigation.
  - Export a role guard so future/unknown token roles cannot crash navigation.
- Modify `packages/web/src/navigation.spec.ts`
  - Add RED tests for member navigation and fallback.
- Modify `packages/web/src/App.tsx`
  - Map backend `member` into the web role system without falling through to merchant text/navigation.
  - Fall back unknown token roles to the settings-only member surface.
  - Prune previously mounted tabs against the current role allow-list so a role switch to member cannot keep old privileged surfaces mounted.
- Modify `packages/web/src/App.spec.tsx`
  - Add a member-login smoke test that renders settings and does not mount merchant/admin surfaces.

---

### Task 1: Shared And Database Role Contract

**Files:**
- Modify: `packages/shared/src/enums/index.ts`
- Modify: `packages/shared/src/dto/entities.dto.ts`
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260706090000_member_role/migration.sql`
- Test: `packages/backend/src/modules/user/user.service.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Add this test inside `describe('UserService 管理能力(商户管理)', () => { ... })` in `packages/backend/src/modules/user/user.service.spec.ts`:

```ts
  it('createUserSchema accepts ordinary member role', () => {
    const parsed = createUserSchema.safeParse({
      username: 'member9',
      role: 'member',
      displayName: 'Member 9',
    });
    expect(parsed.success).toBe(true);
  });
```

- [ ] **Step 2: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts
```

Expected: FAIL because `createUserSchema` rejects `role: 'member'`.

- [ ] **Step 3: Add shared role**

Change `packages/shared/src/enums/index.ts` to:

```ts
export const Role = {
  PLATFORM_ADMIN: 'platform_admin',
  SYSTEM_ADMIN: 'system_admin',
  AGENT_ADMIN: 'agent_admin',
  MERCHANT: 'merchant',
  MEMBER: 'member',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
```

- [ ] **Step 4: Allow member in create-user DTO**

Change the `role` field in `packages/shared/src/dto/entities.dto.ts` to:

```ts
  role: z.enum([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT, Role.MEMBER]),
```

- [ ] **Step 5: Add Prisma enum value**

Change the `Role` enum in `packages/backend/prisma/schema.prisma` to:

```prisma
enum Role {
  platform_admin
  system_admin
  agent_admin
  merchant
  member
}
```

Create `packages/backend/prisma/migrations/20260706090000_member_role/migration.sql`:

```sql
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'member';
```

- [ ] **Step 6: Run GREEN for contract**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts
```

Expected: PASS for the new schema test and existing user-service tests.

- [ ] **Step 7: Build shared package**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
```

Expected: PASS.

---

### Task 2: Backend Member Creation, Listing, And Auth Semantics

**Files:**
- Modify: `packages/backend/src/modules/user/user.service.ts`
- Modify: `packages/backend/src/modules/user/user.service.spec.ts`
- Modify: `packages/backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write failing creation/listing tests**

Add these tests inside `describe('UserService 管理能力(商户管理)', () => { ... })` in `packages/backend/src/modules/user/user.service.spec.ts`:

```ts
  it('system_admin creates member with null agentId even when dto includes agentId', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({
      id: 'mem1',
      username: 'member1',
      role: Role.MEMBER,
      agentId: null,
      displayName: 'Member 1',
    });
    const svc = new UserService(prisma, new ScopeService());

    await svc.create(sysAdmin, {
      username: 'member1',
      role: Role.MEMBER,
      agentId: '00000000-0000-0000-0000-000000000011',
      displayName: 'Member 1',
    });

    expect(prisma.agent?.findFirst).toBeUndefined();
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      role: Role.MEMBER,
      agentId: null,
      username: 'member1',
      displayName: 'Member 1',
    });
  });

  it('agent_admin cannot create ordinary members', async () => {
    const prisma = makePrisma();
    const svc = new UserService(prisma, new ScopeService());

    await expect(svc.create(ctx({ agentId: 'a1' }), {
      username: 'member2',
      role: Role.MEMBER,
      displayName: 'Member 2',
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('list includes members for tenant admins without treating them as merchants', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'mem1', username: 'member1', role: Role.MEMBER, agentId: null, displayName: 'Member 1', status: 'active' },
    ]);
    const svc = new UserService(prisma, new ScopeService());

    const rows = await svc.list(sysAdmin);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
    expect((rows as any[])[0].role).toBe(Role.MEMBER);
  });

  it('listMerchants excludes ordinary members', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.field.groupBy.mockResolvedValue([]);
    const svc = new UserService(prisma, new ScopeService());

    await svc.listMerchants(sysAdmin);

    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      role: Role.MERCHANT,
      status: { not: 'pending' },
    });
  });
```

Upgrade the existing pending-review tests in `packages/backend/src/modules/user/user.service.spec.ts` so pending onboarding is merchant-only:

```ts
expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
  tenantId: 't1',
  role: Role.MERCHANT,
  status: 'pending',
});

expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
  tenantId: 't1',
  id: 'p1',
  role: Role.MERCHANT,
  status: 'pending',
});
```

- [ ] **Step 2: Write failing auth tests**

Add these tests to `packages/backend/src/auth/auth.service.spec.ts`:

```ts
  it('member password login issues token payload with ownerId null', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const svc = makeService({ id: 'mem1', tenantId: 't1', role: 'member', agentId: null, status: 'active', passwordHash: hash });
    const res = await svc.login({ tenantCode: 'DEMO', username: 'member1', password: 'password123' });
    const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.role).toBe('member');
    expect(payload.agentId).toBeNull();
    expect(payload.ownerId).toBeNull();
  });
```

Add this refresh test inside `describe('AuthService.refresh', () => { ... })`:

```ts
  it('refresh rebuilds member payload with ownerId null', async () => {
    const jwt = new JwtService({ secret: 'test' });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'mem1',
          tenantId: 't1',
          role: 'member',
          agentId: null,
          status: 'active',
          tenant: activeTenant,
        }),
      },
    } as any;
    const svc = new AuthService(prisma, jwt, stubIntegrations(), stubGroups());
    const input = await jwt.signAsync(
      { userId: 'mem1', tenantId: 't1', role: 'member', agentId: null, ownerId: null },
      { secret: 'test', expiresIn: '7d' },
    );

    const res = await svc.refresh(input);
    const payload = jwt.verify(res.accessToken, { secret: 'test' }) as any;

    expect(payload.role).toBe('member');
    expect(payload.ownerId).toBeNull();
  });
```

- [ ] **Step 3: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts src/auth/auth.service.spec.ts
```

Expected: user-service tests fail until member creation normalizes `agentId`; auth tests pass only after shared role exists and must prove `ownerId` stays `null`.

- [ ] **Step 4: Implement backend creation semantics**

Change the top of `UserService.create()` in `packages/backend/src/modules/user/user.service.ts` to:

```ts
  async create(actor: AuthUser, dto: CreateUserDto) {
    let agentId = dto.role === Role.MEMBER ? null : (dto.agentId ?? null);
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
      if (!actor.agentId) throw new ForbiddenException('Agent admin is missing agentId');
      agentId = actor.agentId;
    }
```

Keep the existing agent validation and user creation code unchanged after that block.

Change `listPending()` and `review()` in `packages/backend/src/modules/user/user.service.ts` so both queries include `role: Role.MERCHANT`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts src/auth/auth.service.spec.ts
```

Expected: PASS.

---

### Task 3: Web Member Runtime Safety

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`

- [ ] **Step 1: Write failing navigation tests**

Change `ALL_ROLES` in `packages/web/src/navigation.spec.ts` to include `member`, then add:

```ts
  it('limits ordinary members to local settings only', () => {
    expect(idsFor('member')).toEqual(['settings']);
    expect(firstAllowedTab('member', 'fields')).toBe('settings');
    expect(firstAllowedTab('member', 'settings')).toBe('settings');
  });
```

- [ ] **Step 2: Write failing App member smoke test**

Extend the auth mock in `packages/web/src/App.spec.tsx` to use a mutable mock role:

```ts
let mockUserRole = 'platform_admin';

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'mock-user', tenantId: 'mock-tenant', role: mockUserRole, agentId: null, ownerId: null },
    profile: { displayName: 'Mock User' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));
```

Add mocks:

```ts
vi.mock('./components/Settings', () => ({ default: () => <div>Settings View</div> }));
vi.mock('./components/MerchantManagement', () => ({ default: () => <div>Merchant Management View</div> }));
```

Set `mockUserRole = 'platform_admin'` in `beforeEach()`, and add:

```ts
  it('renders only the safe settings surface for ordinary members', async () => {
    mockUserRole = 'member';

    render(<App />);

    expect(await screen.findByText('Settings View')).toBeTruthy();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
  });
```

- [ ] **Step 3: Run RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/navigation.spec.ts src/App.spec.tsx
```

Expected: FAIL because `member` is not a supported `SystemRole` and `App` cannot safely map it.

- [ ] **Step 4: Add member navigation**

Change `SystemRole` in `packages/web/src/navigation.ts`:

```ts
export type SystemRole = 'system_admin' | 'agent_admin' | 'merchant_admin' | 'platform_admin' | 'member';
```

Add:

```ts
const MEMBER_NAV: NavCategory[] = [
  {
    category: '个人中心',
    items: [{ id: 'settings', label: '本地偏好', icon: SettingsIcon }],
  },
];
```

Add `member: MEMBER_NAV` to `NAV_BY_ROLE`, and export:

```ts
export const isSystemRole = (role: string | null | undefined): role is SystemRole =>
  !!role && role in NAV_BY_ROLE;
```

- [ ] **Step 5: Map and label member role in App**

Change the role mapping in `packages/web/src/App.tsx` to use a guard instead of a cast:

```ts
function toSystemRole(role: string): SystemRole {
  if (role === 'merchant') return 'merchant_admin';
  if (isSystemRole(role)) return role;
  return 'member';
}
```

Add a member branch in `roleDisplay()` before the merchant fallback:

```ts
  if (role === 'member') {
    return { title: 'Member', subtitle: '普通会员账号', badge: '普通会员', short: 'Member' };
  }
```

Set `const systemRole: SystemRole | null = user ? toSystemRole(user.role) : null;`.

Add an App smoke test with `mockUserRole = 'future_role'` proving unknown token roles render `Settings View` and do not mount tenant, merchant, or field surfaces.

Add a role-switch smoke test that first renders a merchant, waits for `Farm Fields View`, then rerenders as `member` and proves `Settings View` appears while `Farm Fields View` and merchant management are unmounted.

Update the mounted tab logic in `packages/web/src/App.tsx`:

```ts
const allowedTabs = useMemo(() => navItems.flatMap(category => category.items.map(item => item.id)), [navItems]);

useEffect(() => {
  const allowedTab = firstAllowedTab(navRole, activeTab);
  setMountedTabs(prev => {
    const next = new Set<AppTab>();
    for (const tab of prev) {
      if (allowedTabs.includes(tab)) next.add(tab);
    }
    next.add(allowedTab);
    return next;
  });
}, [navRole, activeTab, allowedTabs]);

const isMounted = (tab: AppTab) => mountedTabs.has(tab) && allowedTabs.includes(tab);
```

Use `isMounted(tab)` for all lazy content panes instead of `mountedTabs.has(tab)`.

- [ ] **Step 6: Run GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/navigation.spec.ts src/App.spec.tsx
```

Expected: PASS.

---

### Task 4: Review, Verification, And Commit

**Files:**
- Review all modified files from Tasks 1-3.

- [ ] **Step 1: Run focused verification**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/user/user.service.spec.ts src/auth/auth.service.spec.ts
corepack pnpm@10.33.2 --filter web test -- src/navigation.spec.ts src/App.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: all commands PASS.

- [ ] **Step 2: Run full regression**

Run:

```bash
corepack pnpm@10.33.2 test:unit
```

Expected: shared build, backend unit tests, web tests, and miniapp tests PASS.

- [ ] **Step 3: Run diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` has no output. `git status --short` lists only the intended plan, shared, backend, Prisma, and web files.

- [ ] **Step 4: Review**

Review checklist:

- `member` is present in shared and Prisma enum contracts.
- `createUserSchema` accepts `member` but still rejects fake fields because the schema remains `.strict()`.
- `system_admin` can create `member`.
- `agent_admin` cannot create `member`.
- `member` creation does not validate or persist `agentId`.
- `listMerchants`, `update`, `setStatus`, pending review flows remain merchant/pending scoped and do not become member management.
- Auth token payload for `member` has `ownerId: null`.
- Web `member` and unknown token roles have settings-only navigation and cannot mount tenant admin, agent admin, merchant, field, or billing surfaces by default, including after switching from a previously privileged role in the same runtime.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-06-user-member-role-p2a.md packages/shared/src/enums/index.ts packages/shared/src/dto/entities.dto.ts packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260706090000_member_role/migration.sql packages/backend/src/modules/user/user.service.ts packages/backend/src/modules/user/user.service.spec.ts packages/backend/src/auth/auth.service.spec.ts packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/App.tsx packages/web/src/App.spec.tsx
git commit -m "feat(user): add member role foundation"
```

Expected: commit succeeds on `codex/user-member-role-p2a`.

---

## Self-Review

- Spec coverage: The plan covers role contract, DB migration, backend creation/list/auth behavior, web runtime safety, verification, review, and commit.
- Placeholder scan: No placeholder tasks remain; each task contains exact file paths, test snippets, implementation snippets, and commands.
- Type consistency: `Role.MEMBER`, string value `'member'`, Prisma enum `member`, and web `SystemRole` value `member` are aligned.
