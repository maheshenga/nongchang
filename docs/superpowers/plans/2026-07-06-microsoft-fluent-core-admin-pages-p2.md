# Microsoft Fluent Core Admin Pages P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the next high-priority admin pages to the approved Microsoft Fluent 2 SaaS Console style while preserving real farm-field, billing, tenant, user-group, and pending-user workflows.

**Architecture:** Reuse the P1 local Fluent helpers in `packages/web/src/ui/fluent.ts` and avoid backend, DTO, route, permission, or billing contract changes. Each page receives a compact page header, command area, neutral surfaces, dense tables/forms, and accessible dialogs without introducing fake metrics or non-backed actions. Tests lock real API behavior and semantic UI affordances instead of brittle visual CSS details.

**Tech Stack:** React 19, Vite, Tailwind v4, TypeScript, Vitest, Testing Library, lucide-react, existing `useApi` and API clients.

---

## Spec And Concept Inputs

- Design spec: `docs/superpowers/specs/2026-07-06-microsoft-fluent-ui-redesign.md`
- Concept image: `docs/superpowers/specs/assets/2026-07-06-microsoft-fluent-ui-redesign-concept.png`
- Existing design helpers: `packages/web/src/ui/fluent.ts`
- Primary scope: `packages/web/src/components/FarmFields.tsx`, `BillingAdmin.tsx`, `TenantManagement.tsx`, `UserGroups.tsx`, `PendingUsers.tsx`

## File Structure

- Modify: `packages/web/src/components/FarmFields.tsx`
  - Restyle the field map/list workspace using Fluent header, command bar, side list, map panel, and create-field dialog.
  - Preserve `listFields`, `createField`, `listMerchants`, `TiandituMap`, `TiandituPicker`, owner logic, and field selection behavior.
- Create: `packages/web/src/components/FarmFields.spec.tsx`
  - Verify field search/filtering, field selection, create dialog opening, and merchant owner control behavior.
- Modify: `packages/web/src/components/BillingAdmin.tsx`
  - Restyle quota/billing operations, account table, recharge and allocation dialogs.
  - Preserve `getBillingSummary`, `listCreditAccounts`, `rechargeCredit`, `allocateCredit`, system-admin gating, and nested real billing components.
- Create: `packages/web/src/components/BillingAdmin.spec.tsx`
  - Verify system-admin recharge access, non-system purchase path, account allocation payload, and real balance/account rendering.
- Modify: `packages/web/src/components/TenantManagement.tsx`
  - Replace green/slate rounded-card styling with Fluent page header, command button, dense tenant table, status tags, and create dialog.
  - Preserve `listTenants`, `createTenant`, `setTenantStatus`, generated initial password disclosure, and status toggle semantics.
- Modify: `packages/web/src/components/UserGroups.tsx`
  - Restyle user-group table, permission editor, confirmation actions, and helper copy.
  - Preserve permission options, default-group switch, `createUserGroup`, `updateUserGroup`, `deleteUserGroup`, and the truthful wording about only connected interfaces enforcing selected group permissions.
- Modify: `packages/web/src/components/PendingUsers.tsx`
  - Restyle pending-review table and approve/reject actions.
  - Preserve confirmation guard, `reviewUser` payloads, reload flow, and date formatting.
- Modify: existing tests:
  - `packages/web/src/components/TenantManagement.spec.tsx`
  - `packages/web/src/components/UserGroups.spec.tsx`
  - Add assertions only where semantics changed or accessibility is improved.

## Verification Commands

Run from `E:\code\nongchang\.worktrees\microsoft-fluent-ui-redesign`:

- Targeted P2 tests: `corepack pnpm@10.33.2 --filter web test -- src/components/FarmFields.spec.tsx src/components/BillingAdmin.spec.tsx src/components/TenantManagement.spec.tsx src/components/UserGroups.spec.tsx`
- Pending-users targeted test if created: `corepack pnpm@10.33.2 --filter web test -- src/components/PendingUsers.spec.tsx`
- Web tests: `corepack pnpm@10.33.2 --filter web test`
- Web lint/type check: `corepack pnpm@10.33.2 --filter web lint`
- Full unit suite: `corepack pnpm@10.33.2 test:unit`
- Dev server: `corepack pnpm@10.33.2 --filter web dev -- --host 127.0.0.1 --port 5173`

## Task 1: FarmFields Fluent Workspace

**Files:**
- Modify: `packages/web/src/components/FarmFields.tsx`
- Create: `packages/web/src/components/FarmFields.spec.tsx`

- [ ] **Step 1: Write the FarmFields tests**

Create `packages/web/src/components/FarmFields.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nongchang/shared';

const listFieldsMock = vi.fn();
const createFieldMock = vi.fn();
const listMerchantsMock = vi.fn();
let authUser: AuthUser | null = null;

vi.mock('../api/fields', () => ({
  listFields: () => listFieldsMock(),
  createField: (...args: unknown[]) => createFieldMock(...args),
}));

vi.mock('../api/agents', () => ({
  listMerchants: () => listMerchantsMock(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: authUser }),
}));

vi.mock('./TiandituMap', () => ({
  default: ({ fields, onSelect }: { fields: Array<{ id: string; name: string }>; onSelect: (id: string) => void }) => (
    <div data-testid="map">
      {fields.map((field) => (
        <button key={field.id} type="button" onClick={() => onSelect(field.id)}>
          map-{field.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./TiandituPicker', () => ({
  default: ({ onPick }: { onPick: (lng: number, lat: number) => void }) => (
    <button type="button" onClick={() => onPick(120.12, 30.16)}>pick-location</button>
  ),
}));

import FarmFields from './FarmFields';

const fields = [
  { id: 'field-1', tenantId: 't1', ownerId: 'owner-1', ownerName: 'Owner A', name: 'North Field', area: 12.5, lng: 120.1, lat: 30.1, iotDeviceId: 'iot-1', createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'field-2', tenantId: 't1', ownerId: 'owner-2', ownerName: 'Owner B', name: 'South Field', area: 8, lng: null, lat: null, iotDeviceId: null, createdAt: '2026-07-02T00:00:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  authUser = { userId: 'admin-1', username: 'admin', role: 'system_admin', displayName: 'Admin', tenantId: 't1' };
  listFieldsMock.mockResolvedValue(fields);
  createFieldMock.mockResolvedValue(fields[0]);
  listMerchantsMock.mockResolvedValue([{ id: 'owner-1', username: 'merchant-a', displayName: 'Owner A' }]);
});

describe('FarmFields Fluent workspace', () => {
  it('renders searchable field list and keeps the real map surface', async () => {
    render(<FarmFields />);
    await screen.findByText('North Field');

    expect(screen.getByRole('heading', { name: /数字地块管理|鏁板瓧鍦板潡绠＄悊/ })).toBeTruthy();
    expect(screen.getByPlaceholderText(/搜索地块|鎼滅储鍦板潡/)).toBeTruthy();
    expect(screen.getByTestId('map')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/搜索地块|鎼滅储鍦板潡/), { target: { value: 'South' } });
    expect(screen.queryByText('North Field')).toBeNull();
    expect(screen.getByText('South Field')).toBeTruthy();
  });

  it('opens create dialog and submits the real createField payload', async () => {
    render(<FarmFields />);
    await screen.findByText('North Field');

    fireEvent.click(screen.getByRole('button', { name: /新建地块|绘制新地块|鏂板湴|缁樺埗/ }));
    fireEvent.change(screen.getByLabelText(/地块名称|鍦板潡鍚嶇О/), { target: { value: 'East Field' } });
    fireEvent.change(screen.getByLabelText(/面积|闈㈢Н/), { target: { value: '3.5' } });
    fireEvent.click(screen.getByText('pick-location'));
    fireEvent.click(screen.getByRole('button', { name: /创建|鍒涘缓/ }));

    await waitFor(() => {
      expect(createFieldMock).toHaveBeenCalledWith({
        ownerId: 'owner-1',
        name: 'East Field',
        area: 3.5,
        lng: 120.12,
        lat: 30.16,
      });
    });
  });
});
```

- [ ] **Step 2: Run the FarmFields tests and verify red**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/FarmFields.spec.tsx
```

Expected: FAIL until the dialog labels and Fluent command surface are implemented or made accessible.

- [ ] **Step 3: Import Fluent helpers and simplify the visual shell**

In `FarmFields.tsx`, add:

```tsx
import { fluentButton, fluentInput, fluentSelect, fluentTable } from '../ui/fluent';
```

Use a root layout:

```tsx
<div className="flex h-full min-h-0 flex-col gap-4">
```

Use a compact page header with:

```tsx
<h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
  <Map className="h-5 w-5 text-[#0078D4]" />
  数字地块管理
</h2>
```

The create button must keep `onClick={() => setShowCreate(true)}` and use `fluentButton('primary')`.

- [ ] **Step 4: Restyle the field search/list/map areas without changing state**

Keep `filteredFields`, `activeField`, `viewMode`, `activeFieldId`, and `TiandituMap` props. Replace emerald rounded-card classes with:

```tsx
<aside className="flex w-full shrink-0 flex-col overflow-hidden border border-[#E1DFDD] bg-white md:w-80">
```

Field rows should remain `<button>` elements and selected rows should use a Microsoft-blue left border:

```tsx
className={`w-full border-l-2 px-3 py-3 text-left text-sm transition-colors ${
  activeField?.id === field.id
    ? 'border-l-[#0078D4] bg-[#EFF6FC] text-[#242424]'
    : 'border-l-transparent hover:bg-[#F5F9FF]'
}`}
```

The map/detail panel should use:

```tsx
<section className="relative flex min-h-[420px] flex-1 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
```

- [ ] **Step 5: Restyle `CreateFieldModal` while preserving payload logic**

Keep `isMerchant`, `ownerId`, `TiandituPicker`, numeric conversion, and `createField(dto)` unchanged. Use `role="dialog"` and `aria-modal="true"` on the overlay container. Replace modal form controls with `fluentInput` and `fluentSelect`. Add explicit `htmlFor` / `id` pairs for name and area inputs so tests and screen readers can identify them.

- [ ] **Step 6: Run and commit Task 1**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/FarmFields.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

Commit:

```powershell
git add packages/web/src/components/FarmFields.tsx packages/web/src/components/FarmFields.spec.tsx
git commit -m "feat(web): redesign field management fluent workspace"
```

## Task 2: BillingAdmin Fluent Operations

**Files:**
- Modify: `packages/web/src/components/BillingAdmin.tsx`
- Create: `packages/web/src/components/BillingAdmin.spec.tsx`

- [ ] **Step 1: Write BillingAdmin tests**

Create `packages/web/src/components/BillingAdmin.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBillingSummaryMock = vi.fn();
const listCreditAccountsMock = vi.fn();
const allocateCreditMock = vi.fn();
const rechargeCreditMock = vi.fn();
let role: string = 'system_admin';

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: { userId: 'u1', username: 'admin', role, displayName: 'Admin', tenantId: 't1' } }),
}));

vi.mock('../api/billing', () => ({
  getBillingSummary: () => getBillingSummaryMock(),
  listCreditAccounts: () => listCreditAccountsMock(),
  allocateCredit: (...args: unknown[]) => allocateCreditMock(...args),
  rechargeCredit: (...args: unknown[]) => rechargeCreditMock(...args),
}));

vi.mock('./BillingLedger', () => ({ default: () => <div>ledger-real-component</div> }));
vi.mock('./BillingPurchase', () => ({ default: () => <div>purchase-real-component</div> }));
vi.mock('./BillingPlans', () => ({ default: () => <div>plans-real-component</div> }));
vi.mock('./BillingAlipayConfig', () => ({ default: () => <div>alipay-real-component</div> }));

import BillingAdmin from './BillingAdmin';

beforeEach(() => {
  vi.clearAllMocks();
  role = 'system_admin';
  getBillingSummaryMock.mockResolvedValue({ aiBalance: 88, codeBalance: 1200 });
  listCreditAccountsMock.mockResolvedValue([
    { id: 'acc-1', ownerType: 'MERCHANT', ownerId: 'merchant-1', ownerName: 'Merchant One', aiBalance: 12, codeBalance: 30 },
  ]);
  allocateCreditMock.mockResolvedValue({ ok: true });
  rechargeCreditMock.mockResolvedValue({ ok: true });
});

describe('BillingAdmin Fluent operations', () => {
  it('renders balances, real child billing surfaces, and system recharge command', async () => {
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    expect(screen.getByRole('heading', { name: /额度管理|棰濆害绠＄悊/ })).toBeTruthy();
    expect(screen.getByText('88')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('plans-real-component')).toBeTruthy();
    expect(screen.getByText('alipay-real-component')).toBeTruthy();
    expect(screen.getByRole('button', { name: /充值|鍏呭€?/ })).toBeTruthy();
  });

  it('submits recharge through the real billing API', async () => {
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    fireEvent.click(screen.getByRole('button', { name: /充值|鍏呭€?/ }));
    fireEvent.change(screen.getByLabelText(/充值数量|鍏呭€兼暟閲?/), { target: { value: '66' } });
    fireEvent.click(screen.getByRole('button', { name: /确认充值|纭鍏呭€?/ }));

    await waitFor(() => {
      expect(rechargeCreditMock).toHaveBeenCalledWith({ resource: 'AI', amount: 66 });
    });
  });

  it('submits allocation using the selected child account identity', async () => {
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    fireEvent.click(screen.getByRole('button', { name: /分配|鍒嗛厤/ }));
    fireEvent.change(screen.getByLabelText(/分配数量|鍒嗛厤鏁伴噺/), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: /确认分配|纭鍒嗛厤/ }));

    await waitFor(() => {
      expect(allocateCreditMock).toHaveBeenCalledWith({
        targetOwnerType: 'MERCHANT',
        targetOwnerId: 'merchant-1',
        resource: 'AI',
        amount: 9,
      });
    });
  });

  it('shows purchase flow instead of platform recharge for non-system users', async () => {
    role = 'merchant';
    render(<BillingAdmin />);
    await screen.findByText('Merchant One');

    expect(screen.queryByRole('button', { name: /充值|鍏呭€?/ })).toBeNull();
    expect(screen.getByText('purchase-real-component')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the BillingAdmin tests and verify red**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/BillingAdmin.spec.tsx
```

Expected: FAIL until labels and accessible commands are stabilized.

- [ ] **Step 3: Import Fluent helpers and restyle local primitives**

In `BillingAdmin.tsx`, import:

```tsx
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
```

Replace `inputCls` with `fluentInput`. Do not change `handleRecharge`, `openAllocate`, or `handleAllocate` payload logic.

- [ ] **Step 4: Convert balance cards and account table**

Keep `LOW = 100` warning logic. Use neutral panels and a small `fluentStatusTag('warning')` for low balances instead of amber pill-heavy cards. Replace the child-account table classes with `fluentTable` and preserve the allocation button handler:

```tsx
<button onClick={() => openAllocate(row)} className={fluentButton('subtle')}>
  <ArrowRightLeft className="h-4 w-4" /> 分配
</button>
```

- [ ] **Step 5: Restyle recharge and allocation dialogs**

Use the P1 modal pattern:

```tsx
<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
  <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl">
```

Add `htmlFor` / `id` pairs for resource and amount controls. Preserve `min={1}` and number conversion.

- [ ] **Step 6: Run and commit Task 2**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/BillingAdmin.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

Commit:

```powershell
git add packages/web/src/components/BillingAdmin.tsx packages/web/src/components/BillingAdmin.spec.tsx
git commit -m "feat(web): redesign billing admin fluent operations"
```

## Task 3: TenantManagement Fluent Table And Dialog

**Files:**
- Modify: `packages/web/src/components/TenantManagement.tsx`
- Modify: `packages/web/src/components/TenantManagement.spec.tsx`

- [ ] **Step 1: Extend tenant tests for Fluent semantics**

In `TenantManagement.spec.tsx`, add assertions to `renders real tenant list fields`:

```tsx
expect(screen.getByRole('button', { name: '新建租户' })).toBeTruthy();
expect(screen.getByRole('columnheader', { name: /租户|绉熸埛/ })).toBeTruthy();
expect(screen.getByRole('columnheader', { name: /编码|缂栫爜/ })).toBeTruthy();
expect(screen.getByText(/启用|鍚敤/)).toBeTruthy();
```

If the source file still uses mojibake labels, keep the existing strings in the test and add regex alternatives rather than renaming backend data or API calls.

- [ ] **Step 2: Run tenant tests and verify current status**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/TenantManagement.spec.tsx
```

Expected: May PASS before implementation for behavior, but visual semantics will be completed by the next steps.

- [ ] **Step 3: Import Fluent helpers and replace local classes**

In `TenantManagement.tsx`, import:

```tsx
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
```

Replace `inputClass` with `fluentInput`.

- [ ] **Step 4: Restyle header, table, status, and dialog**

Use `fluentButton('primary')` for create, `fluentTable` for the table wrapper/header/rows, `fluentStatusTag('success')` for active tenants, and `fluentStatusTag('neutral')` for suspended tenants. Preserve:

```tsx
await createTenant({ name, code, adminUsername, adminDisplayName, ...(adminPhone ? { adminPhone } : {}) });
await setTenantStatus(tenant.id, nextStatus);
```

Keep the generated initial password visible exactly after creation.

- [ ] **Step 5: Run and commit Task 3**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/TenantManagement.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

Commit:

```powershell
git add packages/web/src/components/TenantManagement.tsx packages/web/src/components/TenantManagement.spec.tsx
git commit -m "feat(web): redesign tenant management fluent table"
```

## Task 4: UserGroups And PendingUsers Fluent User-System Pages

**Files:**
- Modify: `packages/web/src/components/UserGroups.tsx`
- Modify: `packages/web/src/components/UserGroups.spec.tsx`
- Modify: `packages/web/src/components/PendingUsers.tsx`
- Create: `packages/web/src/components/PendingUsers.spec.tsx`

- [ ] **Step 1: Add PendingUsers tests**

Create `packages/web/src/components/PendingUsers.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingUserView } from '@nongchang/shared';

const listPendingUsersMock = vi.fn();
const reviewUserMock = vi.fn();

vi.mock('../api/users', () => ({
  listPendingUsers: () => listPendingUsersMock(),
  reviewUser: (...args: unknown[]) => reviewUserMock(...args),
}));

import PendingUsers from './PendingUsers';

const users: PendingUserView[] = [
  { id: 'pending-1', displayName: 'Applicant One', phone: '13800000000', createdAt: '2026-07-05T10:00:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  listPendingUsersMock.mockResolvedValue(users);
  reviewUserMock.mockResolvedValue({ id: 'pending-1', status: 'active' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PendingUsers review workflow', () => {
  it('renders pending users in a dense review table', async () => {
    render(<PendingUsers />);
    await screen.findByText('Applicant One');

    expect(screen.getByRole('heading', { name: /入驻审核|鍏ラ┗瀹℃牳/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /姓名|濮撳悕/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /刷新|鍒锋柊/ })).toBeTruthy();
  });

  it('submits approve and reject actions through the real review API', async () => {
    render(<PendingUsers />);
    await screen.findByText('Applicant One');

    fireEvent.click(screen.getByRole('button', { name: /通过|閫氳繃/ }));
    await waitFor(() => expect(reviewUserMock).toHaveBeenCalledWith('pending-1', { action: 'approve' }));

    fireEvent.click(screen.getByRole('button', { name: /拒绝|鎷掔粷/ }));
    await waitFor(() => expect(reviewUserMock).toHaveBeenCalledWith('pending-1', { action: 'reject' }));
  });
});
```

- [ ] **Step 2: Run user-system tests and verify red for PendingUsers**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx src/components/PendingUsers.spec.tsx
```

Expected: `UserGroups` should reflect existing behavior; `PendingUsers` may fail until accessible labels and table semantics are stabilized.

- [ ] **Step 3: Restyle UserGroups**

Import:

```tsx
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
```

Replace the green/violet header and rounded card table with a Fluent page header and dense table. Preserve `PERMISSION_OPTIONS`, permission checkbox values, default checkbox, create/update/delete payloads, and existing warning/helper copy. Use `fluentButton('danger')` only for destructive delete action if displayed as a button; keep `window.confirm`.

- [ ] **Step 4: Restyle PendingUsers**

Import:

```tsx
import { fluentButton, fluentTable } from '../ui/fluent';
```

Use `fluentButton('secondary')` for refresh, `fluentButton('subtle')` for approve, and `fluentButton('danger')` or danger text for reject. Preserve `window.confirm`, `reviewUser(u.id, { action })`, `reload`, and `fmt`.

- [ ] **Step 5: Run and commit Task 4**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx src/components/PendingUsers.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

Commit:

```powershell
git add packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx packages/web/src/components/PendingUsers.tsx packages/web/src/components/PendingUsers.spec.tsx
git commit -m "feat(web): redesign user system fluent pages"
```

## Task 5: P2 Review, Browser QA, And Final Verification

**Files:**
- Modify only if review or browser QA finds fixable issues in P2 files.

- [ ] **Step 1: Run targeted and full verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/FarmFields.spec.tsx src/components/BillingAdmin.spec.tsx src/components/TenantManagement.spec.tsx src/components/UserGroups.spec.tsx src/components/PendingUsers.spec.tsx
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 test:unit
```

Expected: all commands exit 0. If a command fails, use `superpowers:systematic-debugging` before proposing or applying a fix.

- [ ] **Step 2: Perform spec compliance review**

Check each P2 page against the design spec:

- No green-gradient/card-heavy dominant language remains in these pages.
- No fake metrics, alerts, quota facts, notifications, or capabilities were added.
- API calls and payloads are unchanged.
- Tenant status, billing access, user-group permissions, and pending-review flows remain truthful.
- Tables/forms are usable on desktop and do not overlap on mobile-width layouts.

- [ ] **Step 3: Perform browser QA**

Start the server:

```powershell
corepack pnpm@10.33.2 --filter web dev -- --host 127.0.0.1 --port 5173
```

Use Browser/IAB first. Check:

- Desktop `1440x900`: shell + P2 pages reachable from nav.
- Mobile `390x844`: drawer/nav still usable; command bars wrap; tables scroll instead of overlapping.
- At least one field page, one billing page, one tenant/user page.

Known environment limit: if backend is not running, pages may show request failures. Treat that as environment evidence, not a UI success/failure claim.

- [ ] **Step 4: Commit QA fixes if any**

If files changed:

```powershell
git add packages/web/src/components/FarmFields.tsx packages/web/src/components/FarmFields.spec.tsx packages/web/src/components/BillingAdmin.tsx packages/web/src/components/BillingAdmin.spec.tsx packages/web/src/components/TenantManagement.tsx packages/web/src/components/TenantManagement.spec.tsx packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx packages/web/src/components/PendingUsers.tsx packages/web/src/components/PendingUsers.spec.tsx
git commit -m "fix(web): polish fluent core admin page qa"
```

Do not create an empty commit.

## Review Requirements

- Request or perform a spec compliance review after each task before moving on.
- Request or perform a code-quality review after each task before moving on.
- Main concerns:
  - billing and tenant operations still use real backend APIs.
  - user-system copy does not overstate permission enforcement.
  - field map and picker remain real components, not static placeholders.
  - no backend/shared DTO changes.
  - no persistent screenshot or temp artifacts remain.

## Self-Review

Spec coverage:

- `FarmFields`: Task 1.
- `BillingAdmin`: Task 2.
- `TenantManagement`: Task 3.
- `UserGroups` and `PendingUsers`: Task 4.
- Review, responsive QA, and full verification: Task 5.

Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified test instructions remain.

Type consistency: all referenced Fluent helpers exist in `packages/web/src/ui/fluent.ts`; all test mocks match current API client function names.
