# Platform Admin Web P0-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the newly added `platform_admin` role usable in the web app by adding a platform-only tenant management entry point backed by the real `/tenants` APIs.

**Architecture:** Keep `platform_admin` separate from tenant-scoped `system_admin`. Add a small web API client for the existing backend tenant lifecycle endpoints, add a platform-only navigation branch, and add a focused `TenantManagement` component for list/create/status actions. Do not grant `platform_admin` access to tenant business dashboards in this P0 slice.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, TypeScript, NestJS backend contracts from `@nongchang/shared`, existing `/api` request wrapper.

---

## Scope

This plan implements the first production fix after backend P1-B:

1. Web recognizes `platform_admin` without crashing.
2. Web exposes a platform-only tenant management page.
3. Tenant management uses real backend APIs:
   - `GET /tenants`
   - `POST /tenants`
   - `POST /tenants/:id/status`
4. `platform_admin` navigation does not expose tenant-internal system admin pages.
5. Tests prove API routing, navigation behavior, and basic component flows.

Out of scope:

- Subscription billing plans for tenants.
- Full platform operations dashboard.
- Moving existing tenant billing/admin features from `system_admin` to `platform_admin`.
- Backend API changes; backend endpoints already exist from P1-B.

## File Structure

- Create: `packages/web/src/api/tenants.ts`
  - Responsibility: Typed client for tenant lifecycle endpoints.
- Create: `packages/web/src/api/tenants.spec.ts`
  - Responsibility: Verify API client calls the expected endpoints and payloads.
- Modify: `packages/web/src/navigation.ts`
  - Responsibility: Add `platform_admin` role, `tenants` app tab, and platform-only nav.
- Modify: `packages/web/src/navigation.spec.ts`
  - Responsibility: Verify `platform_admin` gets only tenant management and no tenant business tabs.
- Create: `packages/web/src/components/TenantManagement.tsx`
  - Responsibility: List tenants, create tenant with initial system admin, suspend/reactivate tenants.
- Create: `packages/web/src/components/TenantManagement.spec.tsx`
  - Responsibility: Verify list rendering, create request, and status action behavior.
- Modify: `packages/web/src/App.tsx`
  - Responsibility: Lazy-load and mount `TenantManagement`; display `platform_admin` role label correctly.
- Create or modify: `packages/web/src/App.spec.tsx`
  - Responsibility: Verify `platform_admin` renders the tenant management entry point without falling into tenant admin navigation.

---

### Task 1: Tenant Web API Client

**Files:**
- Create: `packages/web/src/api/tenants.spec.ts`
- Create: `packages/web/src/api/tenants.ts`

- [ ] **Step 1: Write failing API client tests**

Create `packages/web/src/api/tenants.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { createTenant, listTenants, setTenantStatus } from './tenants';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('tenants api', () => {
  it('listTenants calls GET /tenants', async () => {
    await listTenants();
    expect(requestMock).toHaveBeenCalledWith('/tenants');
  });

  it('createTenant calls POST /tenants with the shared DTO payload', async () => {
    const dto = {
      name: 'Tenant A',
      code: 'TENANT_A',
      adminUsername: 'admin',
      adminDisplayName: 'Tenant Admin',
      adminPhone: '13800000000',
    };
    await createTenant(dto);
    expect(requestMock).toHaveBeenCalledWith('/tenants', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  });

  it('setTenantStatus calls POST /tenants/:id/status', async () => {
    await setTenantStatus('tenant-1', 'suspended');
    expect(requestMock).toHaveBeenCalledWith('/tenants/tenant-1/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'suspended' }),
    });
  });
});
```

- [ ] **Step 2: Run API tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/api/tenants.spec.ts
```

Expected: fail because `./tenants` does not exist.

- [ ] **Step 3: Implement tenant API client**

Create `packages/web/src/api/tenants.ts`:

```typescript
import type { CreateTenantDto, CreateTenantResponse, TenantListItem, TenantStatus } from '@nongchang/shared';
import { request } from './request';

export function listTenants(): Promise<TenantListItem[]> {
  return request<TenantListItem[]>('/tenants');
}

export function createTenant(dto: CreateTenantDto): Promise<CreateTenantResponse> {
  return request<CreateTenantResponse>('/tenants', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export function setTenantStatus(id: string, status: TenantStatus): Promise<{ id: string; status: TenantStatus }> {
  return request<{ id: string; status: TenantStatus }>(`/tenants/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}
```

- [ ] **Step 4: Run API tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/api/tenants.spec.ts
```

Expected: tenants API tests pass.

---

### Task 2: Platform Navigation Contract

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`

- [ ] **Step 1: Write failing navigation tests**

Modify `packages/web/src/navigation.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { firstAllowedTab, flattenNavItems, getNavItems, isDemoTab, type SystemRole } from './navigation';

const idsFor = (role: SystemRole) =>
  flattenNavItems(getNavItems(role)).map((item) => item.id);

describe('production navigation', () => {
  it('exposes supply management to merchants', () => {
    expect(idsFor('merchant_admin')).toContain('logistics');
  });

  it('keeps demo-only surfaces out of role navigation', () => {
    for (const role of ['platform_admin', 'system_admin', 'agent_admin', 'merchant_admin'] as const) {
      expect(idsFor(role)).not.toContain('dashboard');
      expect(idsFor(role)).not.toContain('mobile');
      expect(idsFor(role)).not.toContain('warehouse');
    }
  });

  it('does not expose pending user review to agent admins without agent-bound registration', () => {
    expect(idsFor('agent_admin')).not.toContain('pendingUsers');
  });

  it('gives platform admins only the tenant lifecycle surface', () => {
    expect(idsFor('platform_admin')).toEqual(['tenants']);
    expect(idsFor('platform_admin')).not.toContain('system');
    expect(idsFor('platform_admin')).not.toContain('billing');
    expect(idsFor('platform_admin')).not.toContain('merchantFiles');
  });

  it('classifies legacy demo tabs and falls back to the first allowed tab', () => {
    expect(isDemoTab('dashboard')).toBe(true);
    expect(isDemoTab('mobile')).toBe(true);
    expect(isDemoTab('warehouse')).toBe(true);
    expect(firstAllowedTab('platform_admin', 'dashboard')).toBe('tenants');
    expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('fields');
    expect(firstAllowedTab('merchant_admin', 'logistics')).toBe('logistics');
    expect(firstAllowedTab('agent_admin', 'fields')).toBe('merchantFiles');
  });
});
```

- [ ] **Step 2: Run navigation tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/navigation.spec.ts
```

Expected: fail because `SystemRole` does not include `platform_admin` and `AppTab` does not include `tenants`.

- [ ] **Step 3: Implement platform navigation**

Modify `packages/web/src/navigation.ts`:

```typescript
import { Building2 } from 'lucide-react';
```

Update the role and tab types:

```typescript
export type SystemRole = 'platform_admin' | 'system_admin' | 'agent_admin' | 'merchant_admin';
```

Add the tab id:

```typescript
  | 'tenants'
```

Add platform-only navigation before `SYSTEM_ADMIN_NAV`:

```typescript
const PLATFORM_ADMIN_NAV: NavCategory[] = [
  {
    category: '平台运营',
    items: [
      { id: 'tenants', label: '租户管理', icon: Building2 },
    ],
  },
];
```

Update `NAV_BY_ROLE`:

```typescript
const NAV_BY_ROLE: Record<SystemRole, NavCategory[]> = {
  platform_admin: PLATFORM_ADMIN_NAV,
  system_admin: SYSTEM_ADMIN_NAV,
  agent_admin: AGENT_ADMIN_NAV,
  merchant_admin: MERCHANT_ADMIN_NAV,
};
```

- [ ] **Step 4: Run navigation tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/navigation.spec.ts
```

Expected: navigation tests pass.

---

### Task 3: Tenant Management Component

**Files:**
- Create: `packages/web/src/components/TenantManagement.spec.tsx`
- Create: `packages/web/src/components/TenantManagement.tsx`

- [ ] **Step 1: Write failing component tests**

Create `packages/web/src/components/TenantManagement.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateTenantResponse, TenantListItem } from '@nongchang/shared';

const listTenantsMock = vi.fn();
const createTenantMock = vi.fn();
const setTenantStatusMock = vi.fn();

vi.mock('../api/tenants', () => ({
  listTenants: () => listTenantsMock(),
  createTenant: (...args: unknown[]) => createTenantMock(...args),
  setTenantStatus: (...args: unknown[]) => setTenantStatusMock(...args),
}));

import TenantManagement from './TenantManagement';

const tenants: TenantListItem[] = [
  {
    id: 'tenant-1',
    name: 'Demo Tenant',
    code: 'DEMO',
    status: 'active',
    createdAt: '2026-07-05T00:00:00.000Z',
    userCount: 4,
    agentCount: 2,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listTenantsMock.mockResolvedValue(tenants);
  createTenantMock.mockResolvedValue({
    ...tenants[0],
    id: 'tenant-2',
    name: 'New Tenant',
    code: 'NEW',
    adminUser: {
      id: 'admin-1',
      username: 'admin',
      role: 'system_admin',
      displayName: 'Tenant Admin',
    },
    initialPassword: 'generated-secret',
  } satisfies CreateTenantResponse);
  setTenantStatusMock.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
});

describe('TenantManagement', () => {
  it('renders real tenant list fields', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    expect(screen.getByRole('heading', { name: '租户管理' })).toBeTruthy();
    expect(screen.getByText('DEMO')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('creates a tenant and shows the generated initial password', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '新建租户' }));
    fireEvent.change(screen.getByLabelText('租户名称'), { target: { value: 'New Tenant' } });
    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'NEW' } });
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('管理员姓名'), { target: { value: 'Tenant Admin' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createTenantMock).toHaveBeenCalledWith({
        name: 'New Tenant',
        code: 'NEW',
        adminUsername: 'admin',
        adminDisplayName: 'Tenant Admin',
      });
    });
    expect(await screen.findByText(/generated-secret/)).toBeTruthy();
    expect(listTenantsMock).toHaveBeenCalledTimes(2);
  });

  it('suspends an active tenant through the real status API', async () => {
    render(<TenantManagement />);
    await screen.findByText('Demo Tenant');

    fireEvent.click(screen.getByRole('button', { name: '停用 DEMO' }));
    await waitFor(() => {
      expect(setTenantStatusMock).toHaveBeenCalledWith('tenant-1', 'suspended');
    });
    expect(listTenantsMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run component tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/TenantManagement.spec.tsx
```

Expected: fail because `TenantManagement` does not exist.

- [ ] **Step 3: Implement minimal tenant management UI**

Create `packages/web/src/components/TenantManagement.tsx` with:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Plus, Power, PowerOff, X } from 'lucide-react';
import type { CreateTenantResponse, TenantListItem, TenantStatus } from '@nongchang/shared';
import { createTenant, listTenants, setTenantStatus } from '../api/tenants';

type FormState = {
  name: string;
  code: string;
  adminUsername: string;
  adminDisplayName: string;
  adminPhone: string;
};

const emptyForm: FormState = {
  name: '',
  code: '',
  adminUsername: '',
  adminDisplayName: '',
  adminPhone: '',
};

export default function TenantManagement() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lastCreated, setLastCreated] = useState<CreateTenantResponse | null>(null);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      setTenants(await listTenants());
    } catch (err) {
      setError(err instanceof Error ? err.message : '租户列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const created = await createTenant({
        name: form.name.trim(),
        code: form.code.trim(),
        adminUsername: form.adminUsername.trim(),
        adminDisplayName: form.adminDisplayName.trim(),
        ...(form.adminPhone.trim() ? { adminPhone: form.adminPhone.trim() } : {}),
      });
      setLastCreated(created);
      setForm(emptyForm);
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '租户创建失败');
    }
  };

  const changeStatus = async (tenant: TenantListItem) => {
    const next: TenantStatus = tenant.status === 'active' ? 'suspended' : 'active';
    setBusyTenantId(tenant.id);
    setError('');
    try {
      await setTenantStatus(tenant.id, next);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '租户状态更新失败');
    } finally {
      setBusyTenantId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-emerald-600" />
            租户管理
          </h2>
          <p className="mt-1 text-sm text-slate-500">平台管理员用于开通、停用和恢复租户。</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          新建租户
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {lastCreated && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          已创建 {lastCreated.name}，初始管理员 {lastCreated.adminUser.username}，初始密码 {lastCreated.initialPassword}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
          <div>租户</div>
          <div>编码</div>
          <div>状态</div>
          <div>用户</div>
          <div>代理商</div>
          <div>操作</div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中
          </div>
        ) : (
          tenants.map((tenant) => (
            <div key={tenant.id} className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.8fr_0.8fr] gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-700 last:border-0">
              <div className="font-medium text-slate-900">{tenant.name}</div>
              <div className="font-mono text-xs">{tenant.code}</div>
              <div>{tenant.status === 'active' ? '启用' : '停用'}</div>
              <div>{tenant.userCount}</div>
              <div>{tenant.agentCount}</div>
              <div>
                <button
                  type="button"
                  onClick={() => void changeStatus(tenant)}
                  disabled={busyTenantId === tenant.id}
                  aria-label={`${tenant.status === 'active' ? '停用' : '启用'} ${tenant.code}`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {tenant.status === 'active' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  {tenant.status === 'active' ? '停用' : '启用'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">新建租户</h3>
              <button type="button" onClick={() => setCreating(false)} aria-label="关闭" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4">
              {[
                ['租户名称', 'name'],
                ['机构编码', 'code'],
                ['管理员账号', 'adminUsername'],
                ['管理员姓名', 'adminDisplayName'],
                ['管理员手机号', 'adminPhone'],
              ].map(([label, key]) => (
                <label key={key} className="grid gap-1 text-sm font-medium text-slate-700">
                  {label}
                  <input
                    value={form[key as keyof FormState]}
                    onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    required={key !== 'adminPhone'}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">取消</button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">创建</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run component tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/TenantManagement.spec.tsx
```

Expected: component tests pass.

---

### Task 4: App Wiring for Platform Admin

**Files:**
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/App.spec.tsx` if it does not exist, otherwise modify it.

- [ ] **Step 1: Write failing App wiring tests**

Create `packages/web/src/App.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({
    user: { userId: 'platform-user', tenantId: 'platform-tenant', role: 'platform_admin', agentId: null, ownerId: null },
    profile: { displayName: 'Platform Admin' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock('./components/TenantManagement', () => ({ default: () => <div>Tenant Management View</div> }));

import App from './App';

beforeEach(() => {
  window.location.hash = '';
});

describe('App platform_admin wiring', () => {
  it('renders the platform tenant management surface for platform admins', async () => {
    render(<App />);
    expect(await screen.findByText('租户管理')).toBeTruthy();
    expect(await screen.findByText('Tenant Management View')).toBeTruthy();
    expect(screen.queryByText('算力与额度')).toBeNull();
  });
});
```

- [ ] **Step 2: Run App wiring test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx
```

Expected: fail until `App.tsx` lazy-loads and mounts the new `tenants` tab, and role labels handle `platform_admin`.

- [ ] **Step 3: Implement App wiring**

Modify `packages/web/src/App.tsx`:

```tsx
const TenantManagement = lazy(() => import('./components/TenantManagement'));
```

Add a role label helper near `ViewSkeleton`:

```tsx
function roleDisplay(role: SystemRole | null): { title: string; subtitle: string; badge: string; short: string } {
  if (role === 'platform_admin') return { title: 'Platform Admin', subtitle: '平台运营账户', badge: '平台管理员', short: 'Platform' };
  if (role === 'system_admin') return { title: 'Super Admin', subtitle: '企业版授权账户', badge: '总管理员', short: 'Super Admin' };
  if (role === 'agent_admin') return { title: 'Agent Admin', subtitle: '代理商管理专员', badge: '代理商', short: 'Agent' };
  return { title: 'Merchant', subtitle: '商户专属工作台', badge: '商家', short: 'Merchant' };
}
```

Use it inside `App`:

```tsx
const roleInfo = roleDisplay(systemRole);
```

Replace inline role ternaries with `roleInfo.title`, `roleInfo.subtitle`, `roleInfo.badge`, and `roleInfo.short`.

Add the tab mount:

```tsx
{mountedTabs.has('tenants') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'tenants' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><TenantManagement /></div>}
```

- [ ] **Step 4: Run App wiring test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx
```

Expected: App platform wiring test passes.

---

### Task 5: Final Verification, Review, and Commit

**Files:**
- All changed files from Tasks 1-4

- [ ] **Step 1: Run focused web tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/api/tenants.spec.ts src/navigation.spec.ts src/components/TenantManagement.spec.tsx src/App.spec.tsx
```

Expected: focused web tests pass.

- [ ] **Step 2: Run web type/build checks**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: TypeScript check exits 0.

- [ ] **Step 3: Run full unit suite**

Run:

```powershell
corepack pnpm@10.33.2 test:unit
```

Expected:
- backend tests pass.
- web tests pass.
- miniapp tests pass.

- [ ] **Step 4: Run mechanical diff checks**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/saas-platform-admin-p0a diff --check
git -c safe.directory=E:/code/nongchang/.worktrees/saas-platform-admin-p0a diff --stat
git -c safe.directory=E:/code/nongchang/.worktrees/saas-platform-admin-p0a diff
```

Expected:
- `diff --check` exits 0.
- Diff is limited to the P0-A web tenant-management slice and this plan.

- [ ] **Step 5: Local code review**

Review the final diff for:
- `platform_admin` has navigation to tenant management.
- `platform_admin` does not see tenant-internal tabs like billing, agents, fields, or user groups.
- Tenant management calls only real `/tenants` APIs.
- The create form displays the one-time initial password returned by the backend.
- No mock success state is introduced.
- Existing `system_admin`, `agent_admin`, and `merchant_admin` navigation remains unchanged.

- [ ] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/saas-platform-admin-p0a add docs/superpowers/plans/2026-07-05-platform-admin-web-p0a.md packages/web/src/api/tenants.ts packages/web/src/api/tenants.spec.ts packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/components/TenantManagement.tsx packages/web/src/components/TenantManagement.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx
git -c safe.directory=E:/code/nongchang/.worktrees/saas-platform-admin-p0a commit -m "feat(web): add platform tenant management"
```

Expected:
- Commit succeeds on branch `codex/saas-platform-admin-p0a`.

---

## Self-Review

- Spec coverage: This plan covers P0-A only: make `platform_admin` usable in web and expose tenant lifecycle management through real backend endpoints.
- Placeholder scan: No `TBD`, `TODO`, or undefined implementation steps are present.
- Type consistency: `TenantStatus`, `TenantListItem`, `CreateTenantDto`, and `CreateTenantResponse` come from `@nongchang/shared`; `platform_admin` is a web navigation role only and maps to backend `Role.PLATFORM_ADMIN` through JWT payload strings.
- Scope control: This plan does not move billing/admin capabilities between roles, add subscriptions, or change backend APIs.
