# Production Surface Phase 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first production-facing hardening slice real: merchants can use supply management, system admins cannot mutate merchant supply without an owner workflow, and visible web pages stop presenting local/demo behavior as active production capability.

**Architecture:** Keep backend supply ownership rules as the source of truth. Add a small pure navigation module so role menus and production/demo tab rules are unit-testable without rendering the full app. Keep UI changes narrow: wire supply issue to real batch IDs, reduce settings to local preferences, and disable or reroute merchant-page actions that are not backed by real APIs.

**Tech Stack:** pnpm 10.33.2, React 19, Vite, Vitest, Testing Library, NestJS, Prisma, `@nongchang/shared`.

---

## Scope Boundary

This plan implements only Phase 1 and Phase 2 from `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

It does not implement user-group permission enforcement, credit reservations, WeChat OpenID migration, or session revocation. Those remain separate plans because they touch different invariants.

## File Structure

- Create `packages/web/src/navigation.ts`: pure role-to-navigation model, production tab types, fallback helper, and demo-tab classifier.
- Create `packages/web/src/navigation.spec.ts`: tests for merchant supply visibility, production demo gating, and role fallback.
- Modify `packages/web/src/App.tsx`: import navigation model, add merchant supply tab, remove demo tab rendering branches from production shell, and pass navigation callback into `MerchantAdmin`.
- Modify `packages/backend/src/modules/supply/supply.controller.ts`: make supply mutation endpoints merchant-only for the first production-safe slice.
- Modify `packages/backend/src/modules/supply/supply.controller.spec.ts`: prove create, issue, and remove are merchant-only.
- Modify `packages/web/src/components/LogisticsTracker.tsx`: load batches, use batch `id` for issue payload, show batch labels with `batchNo`, and make system-admin view read-only.
- Create `packages/web/src/components/LogisticsTracker.spec.tsx`: tests for merchant issue payload and system-admin read-only view.
- Modify `packages/web/src/components/Settings.tsx`: replace system/security/notification claims with local display preferences only.
- Create `packages/web/src/components/Settings.spec.tsx`: tests that misleading capability claims are absent and local preference saving is explicit.
- Modify `packages/web/src/components/MerchantAdmin.tsx`: route batch creation to the real batch page, use the trace API for code generation, and disable unavailable template/status/shipping/delete actions instead of completing with local toasts.
- Create `packages/web/src/components/MerchantAdmin.actions.spec.tsx`: tests for navigation reroute, real code generation call, and absence of unavailable-action toasts.

## Task 1: Extract Production Navigation Model

**Files:**
- Create: `packages/web/src/navigation.ts`
- Create: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/App.tsx:1-362`

- [ ] **Step 1: Write the failing navigation tests**

Create `packages/web/src/navigation.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { firstAllowedTab, flattenNavItems, getNavItems, isDemoTab } from './navigation';

const idsFor = (role: 'system_admin' | 'agent_admin' | 'merchant_admin') =>
  flattenNavItems(getNavItems(role)).map((item) => item.id);

describe('production navigation', () => {
  it('exposes supply management to merchants', () => {
    expect(idsFor('merchant_admin')).toContain('logistics');
  });

  it('keeps demo-only surfaces out of role navigation', () => {
    for (const role of ['system_admin', 'agent_admin', 'merchant_admin'] as const) {
      expect(idsFor(role)).not.toContain('dashboard');
      expect(idsFor(role)).not.toContain('mobile');
      expect(idsFor(role)).not.toContain('warehouse');
    }
  });

  it('classifies legacy demo tabs and falls back to the first allowed tab', () => {
    expect(isDemoTab('dashboard')).toBe(true);
    expect(isDemoTab('mobile')).toBe(true);
    expect(isDemoTab('warehouse')).toBe(true);
    expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('fields');
    expect(firstAllowedTab('merchant_admin', 'logistics')).toBe('logistics');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/navigation.spec.ts
```

Expected: FAIL because `packages/web/src/navigation.ts` does not exist.

- [ ] **Step 3: Create the navigation module**

Create `packages/web/src/navigation.ts`:

```ts
import {
  QrCode,
  Layers,
  FileSpreadsheet,
  Truck,
  Sparkles,
  Map,
  Settings as SettingsIcon,
  Users,
  Store,
  Plug,
  UserCog,
  LayoutTemplate,
  UserCheck,
  Sprout,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type SystemRole = 'system_admin' | 'agent_admin' | 'merchant_admin';

export type AppTab =
  | 'fields'
  | 'merchant'
  | 'batches'
  | 'records'
  | 'logistics'
  | 'settings'
  | 'agents'
  | 'merchantFiles'
  | 'aiProviders'
  | 'aiOssSettings'
  | 'integrations'
  | 'userGroups'
  | 'pendingUsers'
  | 'quickTemplates'
  | 'aiAssistant'
  | 'phenology'
  | 'billing';

export type LegacyDemoTab = 'dashboard' | 'mobile' | 'warehouse';
export type AnyTab = AppTab | LegacyDemoTab;

export type NavItem = { id: AppTab; label: string; icon: LucideIcon };
export type NavCategory = { category: string; items: NavItem[] };

const SYSTEM_ADMIN_NAV: NavCategory[] = [
  {
    category: '平台组织管理',
    items: [
      { id: 'agents', label: '代理商管理', icon: Users },
      { id: 'merchantFiles', label: '商户管理与档案', icon: Store },
    ],
  },
  {
    category: '生产与供应链',
    items: [
      { id: 'fields', label: '数字地块', icon: Map },
      { id: 'records', label: '农事实操记录', icon: FileSpreadsheet },
      { id: 'phenology', label: '标准物候模型', icon: Sprout },
      { id: 'batches', label: '全域批次追踪', icon: Layers },
      { id: 'logistics', label: '农资投入品管理', icon: Truck },
    ],
  },
  {
    category: '系统',
    items: [
      { id: 'aiAssistant', label: 'AI 助手', icon: Sparkles },
      { id: 'aiProviders', label: 'AI 服务商', icon: Sparkles },
      { id: 'billing', label: '算力与额度', icon: Wallet },
      { id: 'aiOssSettings', label: 'AI 与存储设置', icon: SettingsIcon },
      { id: 'integrations', label: '第三方集成', icon: Plug },
      { id: 'userGroups', label: '用户分组', icon: UserCog },
      { id: 'pendingUsers', label: '入驻审核', icon: UserCheck },
      { id: 'quickTemplates', label: '快捷模板', icon: LayoutTemplate },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
];

const AGENT_ADMIN_NAV: NavCategory[] = [
  {
    category: '代理商中心',
    items: [
      { id: 'merchantFiles', label: '旗下商家管理', icon: Store },
    ],
  },
  {
    category: '业务与系统',
    items: [
      { id: 'batches', label: '辖区批次追踪', icon: Layers },
      { id: 'billing', label: '算力与额度', icon: Wallet },
      { id: 'userGroups', label: '用户分组', icon: UserCog },
      { id: 'pendingUsers', label: '入驻审核', icon: UserCheck },
      { id: 'quickTemplates', label: '快捷模板', icon: LayoutTemplate },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
];

const MERCHANT_ADMIN_NAV: NavCategory[] = [
  {
    category: '生产与档案',
    items: [
      { id: 'fields', label: '我的地块管理', icon: Map },
      { id: 'merchant', label: '我的芍药档案', icon: QrCode },
      { id: 'records', label: '农事实操', icon: FileSpreadsheet },
      { id: 'batches', label: '我的批次记录', icon: Layers },
      { id: 'logistics', label: '农资投入品管理', icon: Truck },
    ],
  },
  {
    category: '系统',
    items: [
      { id: 'aiAssistant', label: 'AI 助手', icon: Sparkles },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
];

export function getNavItems(role: SystemRole | null): NavCategory[] {
  switch (role) {
    case 'system_admin': return SYSTEM_ADMIN_NAV;
    case 'agent_admin': return AGENT_ADMIN_NAV;
    case 'merchant_admin': return MERCHANT_ADMIN_NAV;
    default: return SYSTEM_ADMIN_NAV;
  }
}

export function flattenNavItems(categories: NavCategory[]): NavItem[] {
  return categories.flatMap((category) => category.items);
}

export function isDemoTab(tab: string): tab is LegacyDemoTab {
  return tab === 'dashboard' || tab === 'mobile' || tab === 'warehouse';
}

export function firstAllowedTab(role: SystemRole | null, current: string): AppTab {
  const ids = flattenNavItems(getNavItems(role)).map((item) => item.id);
  return ids.includes(current as AppTab) ? (current as AppTab) : ids[0];
}
```

- [ ] **Step 4: Modify `App.tsx` to use the navigation module**

In `packages/web/src/App.tsx`, replace the lucide import with:

```ts
import { useState, useEffect, lazy, Suspense } from 'react';
import { QrCode, Bell, Sparkles, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import AppLogin from './components/AppLogin';
import { useAuth } from './auth/auth-context';
import { ToastBanner } from './hooks/useToast';
import { firstAllowedTab, getNavItems, type AppTab, type SystemRole } from './navigation';
```

Remove these lazy imports:

```ts
const Dashboard = lazy(() => import('./components/Dashboard'));
const MobileView = lazy(() => import('./components/MobileView'));
const SystemAdmin = lazy(() => import('./components/SystemAdmin'));
```

Remove local `SystemRole`, `NavItem`, `NavCategory`, `SYSTEM_ADMIN_NAV`, `AGENT_ADMIN_NAV`, `MERCHANT_ADMIN_NAV`, and local `getNavItems` definitions.

Change active tab state to:

```ts
const [activeTab, setActiveTab] = useState<AppTab>('fields');
```

Keep:

```ts
const navItems = getNavItems(systemRole);
```

Replace the role fallback effect with:

```ts
useEffect(() => {
  const allowedTab = firstAllowedTab(systemRole, activeTab);
  if (allowedTab !== activeTab) {
    setActiveTab(allowedTab);
  }
}, [systemRole, activeTab]);
```

In the nav button handler, replace the cast with:

```tsx
onClick={() => setActiveTab(item.id)}
```

In the mounted tab rendering block, remove the `dashboard`, `mobile`, and `warehouse` branches. Change the merchant branch to pass a navigation callback:

```tsx
{mountedTabs.has('merchant') && (
  <div className={`h-full transition-opacity duration-300 ${activeTab === 'merchant' ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
    <MerchantAdmin onNavigate={setActiveTab} />
  </div>
)}
```

- [ ] **Step 5: Run the focused test and lint**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/navigation.spec.ts
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS for the navigation spec, and PASS for TypeScript.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git -c safe.directory=E:/code/nongchang add packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/App.tsx
git -c safe.directory=E:/code/nongchang commit -m "feat(web): make production navigation explicit"
```

## Task 2: Make Supply Mutation Merchant-Only

**Files:**
- Modify: `packages/backend/src/modules/supply/supply.controller.ts:15-25`
- Modify: `packages/backend/src/modules/supply/supply.controller.spec.ts:6-15`

- [ ] **Step 1: Expand the failing controller role tests**

Replace `packages/backend/src/modules/supply/supply.controller.spec.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SupplyController } from './supply.controller';

const rolesFor = (methodName: 'create' | 'issue' | 'remove') =>
  Reflect.getMetadata(ROLES_KEY, SupplyController.prototype[methodName]);

describe('SupplyController roles', () => {
  it('keeps create merchant-only because createSupplyInput has no ownerId for admin delegation', () => {
    expect(rolesFor('create')).toEqual([Role.MERCHANT]);
  });

  it('keeps issue merchant-only in the read-only system-admin supply view', () => {
    expect(rolesFor('issue')).toEqual([Role.MERCHANT]);
  });

  it('keeps remove merchant-only in the read-only system-admin supply view', () => {
    expect(rolesFor('remove')).toEqual([Role.MERCHANT]);
  });
});
```

- [ ] **Step 2: Run the focused backend test and confirm it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/supply/supply.controller.spec.ts
```

Expected: FAIL for `issue` and `remove`, because both currently include `Role.SYSTEM_ADMIN`.

- [ ] **Step 3: Restrict mutation endpoint roles**

In `packages/backend/src/modules/supply/supply.controller.ts`, change the decorators to:

```ts
@Post(':id/issue') @Roles(Role.MERCHANT)
issue(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(issueSupplyInputSchema)) dto: IssueSupplyInput) {
  return this.svc.issue(user, id, dto);
}

@Delete(':id') @Roles(Role.MERCHANT)
remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
  return this.svc.remove(user, id);
}
```

- [ ] **Step 4: Run backend supply tests**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/supply/supply.controller.spec.ts src/modules/supply/supply.service.spec.ts src/modules/farm-record/farm-record.service.spec.ts
```

Expected: PASS. The farm-record test proves the existing 110 percent overuse protection still works.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git -c safe.directory=E:/code/nongchang add packages/backend/src/modules/supply/supply.controller.ts packages/backend/src/modules/supply/supply.controller.spec.ts
git -c safe.directory=E:/code/nongchang commit -m "fix(backend): restrict supply mutations to merchants"
```

## Task 3: Wire Supply Issue To Real Batch IDs

**Files:**
- Modify: `packages/web/src/components/LogisticsTracker.tsx:1-230`
- Create: `packages/web/src/components/LogisticsTracker.spec.tsx`

- [ ] **Step 1: Write failing component tests**

Create `packages/web/src/components/LogisticsTracker.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@nongchang/shared';

const listSuppliesMock = vi.fn();
const createSupplyMock = vi.fn();
const issueSupplyMock = vi.fn();
const deleteSupplyMock = vi.fn();
const listBatchesMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../api/supply', () => ({
  listSupplies: () => listSuppliesMock(),
  createSupply: (...args: unknown[]) => createSupplyMock(...args),
  issueSupply: (...args: unknown[]) => issueSupplyMock(...args),
  deleteSupply: (...args: unknown[]) => deleteSupplyMock(...args),
}));

vi.mock('../api/batches', () => ({
  listBatches: () => listBatchesMock(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => useAuthMock(),
}));

import LogisticsTracker from './LogisticsTracker';

const batchId = '11111111-1111-1111-1111-111111111111';

const supplies = [
  {
    id: 'supply-1',
    name: 'Organic fertilizer',
    unit: 'kg',
    total: 100,
    used: 20,
    remaining: 80,
    alert: false,
    createdAt: '2026-07-04T00:00:00.000Z',
  },
];

const batches = [
  {
    id: batchId,
    tenantId: 'tenant-1',
    ownerId: 'merchant-1',
    ownerName: 'Merchant One',
    fieldId: 'field-1',
    batchNo: 'BATCH-001',
    cropName: 'Peony',
    plantDate: '2026-03-01T00:00:00.000Z',
    expectedHarvest: '2026-10-01T00:00:00.000Z',
    status: 'Growing',
    createdAt: '2026-07-01T00:00:00.000Z',
    laborCost: 0,
    sellPrice: 0,
    codeCount: 0,
    scanTotal: 0,
    inputCost: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listSuppliesMock.mockResolvedValue(supplies);
  listBatchesMock.mockResolvedValue(batches);
  createSupplyMock.mockResolvedValue(supplies[0]);
  issueSupplyMock.mockResolvedValue({ supplyId: 'supply-1', used: 32, remaining: 68 });
  deleteSupplyMock.mockResolvedValue({ id: 'supply-1' });
  useAuthMock.mockReturnValue({ user: { role: Role.MERCHANT } });
});

describe('LogisticsTracker', () => {
  it('issues supply with the selected batch id instead of a typed batch number', async () => {
    const { container } = render(<LogisticsTracker />);
    await screen.findByText('Organic fertilizer');

    fireEvent.click(screen.getByRole('button', { name: /领用下达/ }));

    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'supply-1' } });
    fireEvent.change(selects[1], { target: { value: batchId } });

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '12' } });

    fireEvent.click(screen.getByRole('button', { name: /确认下发/ }));

    await waitFor(() => {
      expect(issueSupplyMock).toHaveBeenCalledWith('supply-1', { batchId, amount: 12 });
    });
  });

  it('renders system admin supply management as read-only', async () => {
    useAuthMock.mockReturnValue({ user: { role: Role.SYSTEM_ADMIN } });

    render(<LogisticsTracker />);
    await screen.findByText('Organic fertilizer');

    expect(screen.queryByRole('button', { name: /入库登记/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /领用下达/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
    expect(screen.getByText(/只读/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the focused component test and confirm it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/LogisticsTracker.spec.tsx
```

Expected: FAIL because the component does not import batches and still uses a free-text `targetBatch`.

- [ ] **Step 3: Modify `LogisticsTracker.tsx` imports and state**

At the top of `packages/web/src/components/LogisticsTracker.tsx`, change imports to:

```ts
import { PackageSearch, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Role } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listSupplies, createSupply, issueSupply, deleteSupply } from '../api/supply';
import { listBatches } from '../api/batches';
import { useAuth } from '../auth/auth-context';
```

Inside the component, replace the first state block with:

```ts
const { user } = useAuth();
const isMerchant = user?.role === Role.MERCHANT;
const { data: supplies, loading: suppliesLoading, error: suppliesError, reload: reloadSupplies } = useApi(listSupplies);
const { data: batches, loading: batchesLoading, error: batchesError } = useApi(listBatches);
const [showInboundModal, setShowInboundModal] = useState(false);
const [showOutboundModal, setShowOutboundModal] = useState(false);

const [issuePayload, setIssuePayload] = useState({ supplyId: '', amount: 0, batchId: '' });
const [inboundPayload, setInboundPayload] = useState({ name: '', amount: 0, unit: '箱' });
```

- [ ] **Step 4: Modify the issue submit handler**

Replace `handleIssueSubmit` with:

```ts
const handleIssueSubmit = async () => {
  if (!isMerchant) return showToast('当前视图只读');
  if (!issuePayload.supplyId || issuePayload.amount <= 0) return showToast('请输入完整信息');
  if (!issuePayload.batchId) return showToast('请选择关联批次');
  try {
    await issueSupply(issuePayload.supplyId, { batchId: issuePayload.batchId, amount: issuePayload.amount });
    setShowOutboundModal(false);
    setIssuePayload({ supplyId: '', amount: 0, batchId: '' });
    showToast('领用单下发成功');
    await reloadSupplies();
  } catch (e: any) {
    showToast(e?.message || '领用失败');
  }
};
```

At the start of `handleInboundSubmit`, add:

```ts
if (!isMerchant) return showToast('当前视图只读');
```

- [ ] **Step 5: Hide mutation controls for non-merchants**

Replace the action button group in the card header with:

```tsx
<div className="flex gap-3">
  {isMerchant ? (
    <>
      <button onClick={() => setShowInboundModal(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all shadow-sm">
        入库登记
      </button>
      <button onClick={() => setShowOutboundModal(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm hover:bg-cyan-700 transition-all hover:-translate-y-0.5">
        <Plus className="w-4 h-4" /> 领用下达
      </button>
    </>
  ) : (
    <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
      只读视图
    </span>
  )}
</div>
```

Wrap the delete button inside each supply row with `isMerchant && (...)` so system admins cannot see it:

```tsx
{isMerchant && (
  <button
    onClick={async () => {
      if (window.confirm('确认删除此农资记录吗?')) {
        try {
          await deleteSupply(item.id);
          showToast(`已删除农资档案:${item.name}`);
          await reloadSupplies();
        } catch (e: any) {
          showToast(e?.message || '删除失败');
        }
      }
    }}
    className="ml-4 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold transition-colors border border-red-200"
  >
    删除
  </button>
)}
```

- [ ] **Step 6: Replace the batch-number input with a batch dropdown**

In the outbound modal, replace the `targetBatch` input block with:

```tsx
<div>
  <label className="block text-xs font-bold text-slate-500 mb-1">关联生产批次</label>
  <select
    value={issuePayload.batchId}
    onChange={(e) => setIssuePayload({ ...issuePayload, batchId: e.target.value })}
    disabled={batchesLoading}
    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100 disabled:text-slate-400"
  >
    <option value="">-- 请选择批次 --</option>
    {(batches ?? []).map((batch) => (
      <option key={batch.id} value={batch.id}>
        {batch.batchNo} - {batch.cropName}{batch.ownerName ? ` / ${batch.ownerName}` : ''}
      </option>
    ))}
  </select>
  {batchesError && <p className="text-xs text-red-600 mt-1">批次加载失败:{batchesError}</p>}
</div>
```

- [ ] **Step 7: Run focused web tests**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/LogisticsTracker.spec.tsx packages/web/src/api/supply.spec.ts
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git -c safe.directory=E:/code/nongchang add packages/web/src/components/LogisticsTracker.tsx packages/web/src/components/LogisticsTracker.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "fix(web): issue supplies with selected batch ids"
```

## Task 4: Replace Misleading Settings With Local Preferences

**Files:**
- Modify: `packages/web/src/components/Settings.tsx:1-266`
- Create: `packages/web/src/components/Settings.spec.tsx`

- [ ] **Step 1: Write failing settings authenticity tests**

Create `packages/web/src/components/Settings.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Settings from './Settings';

describe('Settings production wording', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not claim unimplemented system capabilities', () => {
    render(<Settings />);

    expect(screen.queryByText(/IoT/i)).toBeNull();
    expect(screen.queryByText(/区块链/)).toBeNull();
    expect(screen.queryByText(/智能合约/)).toBeNull();
    expect(screen.queryByText(/推送/)).toBeNull();
    expect(screen.queryByText(/通知订阅/)).toBeNull();
    expect(screen.queryByText(/系统参数/)).toBeNull();
  });

  it('saves only local display preferences', () => {
    render(<Settings />);

    fireEvent.click(screen.getByLabelText('紧凑表格'));
    fireEvent.click(screen.getByRole('button', { name: /保存本地偏好/ }));

    expect(localStorage.getItem('agri_display_preferences')).toContain('"compactTables":true');
    expect(screen.getByText('本地偏好已保存')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the focused settings test and confirm it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/Settings.spec.tsx
```

Expected: FAIL because the current settings page contains IoT, blockchain, push-notification, and system-parameter claims.

- [ ] **Step 3: Replace `Settings.tsx` with local preference UI**

Replace `packages/web/src/components/Settings.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { Check, MonitorCog, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const STORAGE_KEY = 'agri_display_preferences';

type Preferences = {
  compactTables: boolean;
  reduceMotion: boolean;
  dateFormat: 'date' | 'dateTime';
};

const DEFAULT_PREFERENCES: Preferences = {
  compactTables: false,
  reduceMotion: false,
  dateFormat: 'date',
};

function loadPreferences(): Preferences {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_PREFERENCES;
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export default function Settings() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl z-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> 本地偏好已保存
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 p-2 rounded-xl shadow-sm">
            <MonitorCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">本地偏好</h2>
            <p className="text-xs text-slate-500 mt-0.5">仅保存当前浏览器的显示习惯。账户资料与密码请从右上角头像进入。</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> 保存本地偏好
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">显示密度</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">影响支持该偏好的表格与列表间距。</p>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm font-medium text-slate-700">紧凑表格</span>
              <input
                aria-label="紧凑表格"
                type="checkbox"
                checked={preferences.compactTables}
                onChange={(e) => update('compactTables', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">动效偏好</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">减少非必要过渡动画，适合长时间后台操作。</p>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm font-medium text-slate-700">减少动效</span>
              <input
                aria-label="减少动效"
                type="checkbox"
                checked={preferences.reduceMotion}
                onChange={(e) => update('reduceMotion', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">日期显示</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">选择列表中日期字段的默认显示格式。</p>
            <select
              aria-label="日期显示格式"
              value={preferences.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value as Preferences['dateFormat'])}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="date">仅日期</option>
              <option value="dateTime">日期与时间</option>
            </select>
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run focused settings test and lint**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/Settings.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git -c safe.directory=E:/code/nongchang add packages/web/src/components/Settings.tsx packages/web/src/components/Settings.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "fix(web): make settings local-preference only"
```

## Task 5: Remove Fake Primary Actions From MerchantAdmin

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.tsx:1-660`
- Create: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
- Modify: `packages/web/src/App.tsx:346-348`

- [ ] **Step 1: Write failing MerchantAdmin action tests**

Create `packages/web/src/components/MerchantAdmin.actions.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBatchesMock = vi.fn();
const generateCodesMock = vi.fn();

vi.mock('../api/batches', () => ({
  listBatches: () => listBatchesMock(),
}));

vi.mock('../api/trace', () => ({
  generateCodes: (...args: unknown[]) => generateCodesMock(...args),
}));

import MerchantAdmin from './MerchantAdmin';

const batch = {
  id: 'batch-1',
  tenantId: 'tenant-1',
  ownerId: 'merchant-1',
  ownerName: 'Merchant One',
  fieldId: 'field-1',
  batchNo: 'BATCH-001',
  cropName: 'Peony',
  plantDate: '2026-03-01T00:00:00.000Z',
  expectedHarvest: '2026-10-01T00:00:00.000Z',
  status: 'Growing',
  createdAt: '2026-07-01T00:00:00.000Z',
  laborCost: 0,
  sellPrice: 0,
  codeCount: 0,
  scanTotal: 0,
  inputCost: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  listBatchesMock.mockResolvedValue([batch]);
  generateCodesMock.mockResolvedValue([{ code: 'TRACE-001' }]);
});

describe('MerchantAdmin production actions', () => {
  it('routes batch creation to the real batch page', async () => {
    const onNavigate = vi.fn();
    render(<MerchantAdmin onNavigate={onNavigate} />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByRole('button', { name: /新增.*生产批次/ }));

    expect(onNavigate).toHaveBeenCalledWith('batches');
  });

  it('generates trace codes through the real API from the side panel', async () => {
    const { container } = render(<MerchantAdmin />);
    await screen.findByText('Peony');

    fireEvent.click(screen.getByText('Peony'));
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /生成溯源码/ }));

    await waitFor(() => {
      expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 5);
    });
  });

  it('does not show local completion toasts for unavailable actions', async () => {
    render(<MerchantAdmin />);
    await screen.findByText('Peony');

    expect(screen.queryByText(/待后端接入/)).toBeNull();
    expect(screen.getByRole('button', { name: /模板定制未开通/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /到批次管理流转/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /到批次管理删除/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/MerchantAdmin.actions.spec.tsx
```

Expected: FAIL because `MerchantAdmin` has no `onNavigate` prop, the side-panel generation button does not call `generateCodes`, and unavailable actions are still interactive or toast-backed.

- [ ] **Step 3: Add `onNavigate` support and real code generation**

In `packages/web/src/components/MerchantAdmin.tsx`, add the navigation type import:

```ts
import type { AppTab } from '../navigation';
```

Change the component signature:

```ts
export default function MerchantAdmin({ onNavigate }: { onNavigate?: (tab: AppTab) => void }) {
```

Add this handler after `openPrintPreview`:

```ts
const generateForActiveCrop = async () => {
  if (!activeCrop) return;
  if (!Number.isFinite(qrAmount) || qrAmount <= 0) {
    showToast('请输入有效的赋码数量');
    return;
  }
  setGeneratingPrint(true);
  try {
    const codes = await generateCodes(activeCrop.id, qrAmount);
    const firstCode = codes[0]?.code;
    if (firstCode) {
      setCropCodes((current) => ({ ...current, [activeCrop.id]: firstCode }));
    }
    showToast(`已生成 ${codes.length} 个溯源码`);
    await reload();
  } catch (e) {
    showToast(e instanceof Error ? `生成溯源码失败:${e.message}` : '生成溯源码失败');
  } finally {
    setGeneratingPrint(false);
  }
};
```

- [ ] **Step 4: Replace unavailable actions with reroute or disabled controls**

Change the new-batch button to:

```tsx
<button
  onClick={() => onNavigate?.('batches')}
  className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm shrink-0"
>
  <Plus className="w-4 h-4" />
  新增芍药繁育生产批次
</button>
```

Change the row action buttons to:

```tsx
<button
  disabled
  title="请在批次管理中执行状态流转"
  className="text-slate-400 font-bold text-[10px] bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg cursor-not-allowed"
>
  到批次管理流转
</button>
<button
  onClick={() => {
    setSelectedCropIds(new Set([crop.id]));
  }}
  className="text-emerald-700 hover:text-white hover:bg-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
>
  选择后生成
</button>
<button
  disabled
  title="发货流向绑定未在当前页开放"
  className="text-indigo-300 font-bold text-[10px] bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg cursor-not-allowed"
>
  发货流向绑定未开通
</button>
<button className="text-slate-600 hover:text-slate-800 hover:bg-slate-100 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white transition-colors shadow-sm">
  生命周期追溯档案
</button>
<button
  onClick={() => {
    window.print();
  }}
  className="flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-bold text-[10px] border border-slate-200 bg-white rounded-lg px-3 py-1.5 transition-colors shadow-sm"
>
  <Printer className="w-3 h-3" />
  出入库单 PDF
</button>
<button
  disabled
  title="请在批次管理中删除批次"
  className="flex items-center gap-1 text-red-300 font-bold text-[10px] border border-red-100 bg-red-50 rounded-lg px-3 py-1.5 cursor-not-allowed"
>
  到批次管理删除
</button>
```

Change the template button near the top to disabled:

```tsx
<button
  disabled
  title="模板定制未在当前生产页开放"
  className="flex items-center gap-2 bg-slate-100 text-slate-400 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm cursor-not-allowed"
>
  <Settings2 className="w-4 h-4" />
  模板定制未开通
</button>
```

Change the side-panel generation button to call the real API:

```tsx
<button
  onClick={() => void generateForActiveCrop()}
  disabled={generatingPrint}
  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-emerald-600/20 flex items-center justify-center gap-2 focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-50"
>
  <Printer className="w-4 h-4" />
  {generatingPrint ? '生成中...' : '生成溯源码'}
</button>
```

- [ ] **Step 5: Make sure `App.tsx` passes the navigation prop**

Confirm the merchant branch from Task 1 is present:

```tsx
<MerchantAdmin onNavigate={setActiveTab} />
```

- [ ] **Step 6: Run focused MerchantAdmin tests and lint**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/MerchantAdmin.actions.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git -c safe.directory=E:/code/nongchang add packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx packages/web/src/App.tsx
git -c safe.directory=E:/code/nongchang commit -m "fix(web): remove fake merchant admin actions"
```

## Task 6: Final Verification Gate

**Files:**
- Read: all files changed by Tasks 1-5

- [ ] **Step 1: Run web-focused tests**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/navigation.spec.ts packages/web/src/components/LogisticsTracker.spec.tsx packages/web/src/components/Settings.spec.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx packages/web/src/api/supply.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend-focused tests**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/supply/supply.controller.spec.ts src/modules/supply/supply.service.spec.ts src/modules/farm-record/farm-record.service.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run required builds and full unit suite**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 test:unit
```

Expected: all commands PASS.

- [ ] **Step 4: Run e2e if local PostGIS is available**

Start the local database:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Run:

```bash
corepack pnpm@10.33.2 test:e2e
```

Expected: PASS. If the database cannot start in the current machine, record the Docker/PostGIS failure text in the final handoff and do not claim e2e passed.

- [ ] **Step 5: Final diff audit**

Run:

```bash
git -c safe.directory=E:/code/nongchang status --short
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/App.tsx packages/backend/src/modules/supply/supply.controller.ts packages/backend/src/modules/supply/supply.controller.spec.ts packages/web/src/components/LogisticsTracker.tsx packages/web/src/components/LogisticsTracker.spec.tsx packages/web/src/components/Settings.tsx packages/web/src/components/Settings.spec.tsx packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx
```

Expected: only the planned files are changed.

- [ ] **Step 6: Commit final verification notes if any docs were updated**

If no docs were updated during execution, skip this step. If a verification note file was created, commit it:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers
git -c safe.directory=E:/code/nongchang commit -m "docs: record production surface verification"
```

