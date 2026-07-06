# Microsoft Fluent Global Polish P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove globally visible mojibake and remaining high-visibility legacy admin styling after P2, while preserving all existing API contracts, role navigation, tenant boundaries, and truthful feature behavior.

**Architecture:** Keep this as a frontend-only polish slice inside `packages/web`. Reuse the existing local Fluent helpers from `packages/web/src/ui/fluent.ts` instead of introducing a new UI library or rewriting business logic. Each page keeps its current API calls and state transitions, but receives readable Chinese copy, Microsoft Fluent SaaS console styling, responsive wrapping, and focused tests for the preserved behavior.

**Tech Stack:** React, TypeScript, Vite/Vitest, Testing Library, Tailwind utility classes, Lucide icons, existing `@nongchang/shared` DTOs and enums.

---

## Scope

In scope:

- Fix visible mojibake in the authenticated shell, navigation labels, role labels, login page, and related tests.
- Redesign `AgentManagement` and `MerchantManagement` to match the Fluent admin table style.
- Polish `AiProviders` and its visible operations enough that the system settings area no longer looks like the old emerald/card-heavy UI.
- Add or update tests for visible copy, permission-preserving navigation, action payloads, status toggles, modal behavior, and login error wording.
- Run targeted tests, full web tests, web lint, full unit suite, browser QA, review, and commit.

Out of scope:

- Backend schema, DTO, role, billing, tenant, and permission changes.
- New dashboards, fake metrics, fake health scores, fake notification counts, or unsupported actions.
- Public trace/mobile miniapp redesign.
- Exact Microsoft Fluent React package migration.

## Files

- Modify: `packages/web/src/App.tsx`
  - Replace mojibake app name, global search placeholder, role display labels, breadcrumb fallback, billing shortcut, account/logout copy.
  - Preserve role fallback and mounted-tab cleanup behavior.

- Modify: `packages/web/src/navigation.ts`
  - Replace mojibake nav categories and labels with readable Chinese.
  - Preserve the exact tab ids per role and `firstAllowedTab` semantics.

- Modify: `packages/web/src/components/AppLogin.tsx`
  - Replace mojibake login copy and old emerald/teal gradient with Fluent blue-neutral login surface.
  - Preserve `login({ tenantCode, username, password })`, required fields, and backend error display.

- Modify: `packages/web/src/App.spec.tsx`
  - Update shell text assertions from mojibake to readable Chinese.
  - Keep existing role isolation tests.

- Modify/Create: `packages/web/src/components/AppLogin.spec.tsx`
  - Verify the login form uses the real payload and displays backend errors in readable Chinese fallback.

- Modify: `packages/web/src/components/AgentManagement.tsx`
  - Restyle as Fluent table with page header, search command row, dense table, readable status tags, accessible row actions, and dialog.
  - Preserve `listAgents`, `createAgent`, `updateAgent`, `setAgentStatus`, search semantics, status confirmation.

- Create: `packages/web/src/components/AgentManagement.spec.tsx`
  - Verify render/loading/error copy, search filtering, create payload, update payload, and active/suspended toggle payload.

- Modify: `packages/web/src/components/MerchantManagement.tsx`
  - Restyle as Fluent table with filter segmented controls and dialog.
  - Preserve `listMerchants`, `createUser`, `updateUser`, `setUserStatus`, `Role.MERCHANT`, initial password alert from backend response only.

- Create: `packages/web/src/components/MerchantManagement.spec.tsx`
  - Verify status filtering, create payload, backend-returned initial password alert, update payload, and status toggle.

- Modify: `packages/web/src/components/AiProviders.tsx`
  - Restyle the provider list shell, command button, table, test result copy, empty/loading/error states, and delete confirmation.
  - Preserve provider CRUD/test calls and `AiProviderModal`/`AiPlayground` mounting.

- Modify: `packages/web/src/components/AiProviderModal.tsx`
  - Replace mojibake and green focus styles with Fluent modal copy/style while preserving submitted fields.

- Modify: `packages/web/src/components/AiPlayground.tsx`
  - Replace obvious emerald-heavy control styling with Fluent blue-neutral styles where it is visible inside `AiProviders`.
  - Preserve existing text/vision/batch request behavior.

- Create/Modify: `packages/web/src/components/AiProviders.spec.tsx`
  - Verify provider toggle, delete confirmation, test result display, create modal open, and child playground presence without mocking fake states.

---

### Task 1: Shell, navigation, and login copy

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/components/AppLogin.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Create: `packages/web/src/components/AppLogin.spec.tsx`

- [ ] **Step 1: Update tests for readable shell/navigation/login copy**

Update `packages/web/src/App.spec.tsx` so the Fluent shell test asserts:

```tsx
expect(await screen.findByText('农场溯源管理')).toBeTruthy();
expect(screen.getByPlaceholderText('搜索资源、菜单和功能')).toBeTruthy();
expect(screen.getByRole('button', { name: /退出/ })).toBeTruthy();
```

Update the batch navigation test so it finds:

```tsx
const batchTab = await screen.findByRole('button', { name: /批次管理/ });
```

Update the mobile navigation test so it expects:

```tsx
expect(mobileNav.textContent).toContain('批次管理');
```

Create `packages/web/src/components/AppLogin.spec.tsx` with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLogin from './AppLogin';

const loginMock = vi.fn();

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ login: loginMock }),
}));

describe('AppLogin Fluent login', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('submits the real tenant login payload', async () => {
    loginMock.mockResolvedValue(undefined);
    render(<AppLogin />);

    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'tenant-a' } });
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ tenantCode: 'tenant-a', username: 'admin', password: 'secret' });
    });
  });

  it('shows readable fallback copy when login fails without an Error', async () => {
    loginMock.mockRejectedValue('bad');
    render(<AppLogin />);

    fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'tenant-a' } });
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '安全登录' }));

    expect(await screen.findByText('登录失败')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the failing focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx src/components/AppLogin.spec.tsx
```

Expected before implementation: failures because current visible copy is mojibake and `AppLogin.spec.tsx` is new.

- [ ] **Step 3: Replace shell/navigation/login copy and styling**

Implementation requirements:

- In `navigation.ts`, keep all role/tab ids unchanged.
- Use these category/label values:

```ts
const PLATFORM_ADMIN_NAV: NavCategory[] = [
  { category: '平台运营', items: [{ id: 'tenants', label: '租户管理', icon: Building2 }] },
];

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
      { id: 'batches', label: '全域批次追溯', icon: Layers },
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
```

- In `App.tsx`, role labels should be readable:

```ts
platform_admin: { title: 'Platform Admin', subtitle: '平台运营账户', badge: '平台管理员', short: 'Platform' }
system_admin: { title: 'Super Admin', subtitle: '企业授权账户', badge: '总管理员', short: 'Super Admin' }
agent_admin: { title: 'Agent Admin', subtitle: '代理商管理账户', badge: '代理商', short: 'Agent' }
member: { title: 'Member', subtitle: '普通会员账户', badge: '普通会员', short: 'Member' }
default merchant: { title: 'Merchant', subtitle: '商户工作台账户', badge: '商户', short: 'Merchant' }
```

- `navLabel` should return `批次管理`, `地块管理`, `计费中心` for those ids.
- App name: `农场溯源管理`
- Search placeholder: `搜索资源、菜单和功能`
- Billing shortcut: `打开计费资源`
- Header user fallback: `已登录用户`
- Account button: `账户`
- Logout button: `退出`
- Breadcrumb prefix/fallback: `首页 / ...`, fallback `工作台`.

For `AppLogin.tsx`, use readable copy and Fluent blue-neutral styling:

- Title: `农业溯源 SaaS 平台`
- Subtitle: `全链路数据存证与数字农业协作`
- Tab label: `系统登录`
- Labels: `机构编码`, `登录账号`, `密码`
- Placeholders: `请输入机构编码`, `请输入用户名`, `••••••••`
- Fallback error: `登录失败`
- Submit loading: `登录中...`
- Submit idle: `安全登录`
- Footer: `© 2026 数字农业溯源系统. All rights reserved.`
- Background should use `#F5F5F5`, white login panel, `#0078D4` primary button, 1px borders, no emerald gradient.

- [ ] **Step 4: Verify focused tests pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx src/components/AppLogin.spec.tsx
```

Expected: selected tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/App.tsx packages/web/src/navigation.ts packages/web/src/components/AppLogin.tsx packages/web/src/App.spec.tsx packages/web/src/components/AppLogin.spec.tsx
git commit -m "fix(web): restore readable fluent shell and login copy"
```

---

### Task 2: Agent management Fluent table

**Files:**
- Modify: `packages/web/src/components/AgentManagement.tsx`
- Create: `packages/web/src/components/AgentManagement.spec.tsx`

- [ ] **Step 1: Add behavior tests**

Create tests that mock `../api/agents` and verify:

- Header text `代理商管理` and command `新增代理商`.
- Search filters by name or region.
- Create submits `{ name, region }` to `createAgent`.
- Edit submits `{ name, region }` to `updateAgent(id, dto)`.
- Status toggle confirms and calls `setAgentStatus(id, 'suspended')` from active and `'active'` from suspended.

- [ ] **Step 2: Run focused tests before implementation**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/AgentManagement.spec.tsx
```

Expected before implementation: tests fail because the file is new and copy/styling may not match.

- [ ] **Step 3: Redesign component**

Implementation requirements:

- Keep imports from `listAgents`, `createAgent`, `updateAgent`, `setAgentStatus`.
- Replace old `rounded-2xl`, `shadow`, `indigo`, and `emerald` table styling with Fluent helpers:
  - `fluentButton`
  - `fluentInput`
  - `fluentTable`
  - `fluentStatusTag`
- Page header: white bordered block with title `代理商管理`, helper `管理代理商组织、辖区与下级商户归属`, command `新增代理商`.
- Search placeholder: `搜索代理商名称或辖区`.
- Table columns: `代理商名称`, `辖区`, `下级商户`, `状态`, `创建时间`, `操作`.
- Loading: `加载中...`
- Error: `加载失败: {error}` and `重试`.
- Empty: `暂无匹配代理商`.
- Status labels: active `正常`, suspended `已停用`.
- Confirm copy:
  - suspend: `确认停用该代理商？停用后该代理商账号将无法登录。`
  - activate: `确认启用该代理商？`
- Dialog labels: `新增代理商`, `编辑代理商`, `代理商名称`, `辖区`, `取消`, `确认添加`, `保存修改`.
- Action accessible names should include row identity: `编辑代理商 ${agent.name}`, `停用代理商 ${agent.name}`, `启用代理商 ${agent.name}`.

- [ ] **Step 4: Verify focused tests pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/AgentManagement.spec.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/AgentManagement.tsx packages/web/src/components/AgentManagement.spec.tsx
git commit -m "feat(web): redesign agent management fluent table"
```

---

### Task 3: Merchant management Fluent table

**Files:**
- Modify: `packages/web/src/components/MerchantManagement.tsx`
- Create: `packages/web/src/components/MerchantManagement.spec.tsx`

- [ ] **Step 1: Add behavior tests**

Create tests that mock `../api/users` and verify:

- Header text `商户管理与档案` and command `新增入驻`.
- Search filters by display name or username.
- Status filter toggles between all/active/suspended.
- Create submits `Role.MERCHANT`, display name, username, and optional phone to `createUser`.
- Initial password alert includes the backend returned `initialPassword`.
- Edit disables username and submits `{ displayName, phone: valueOrNull }` to `updateUser`.
- Status toggle calls `setUserStatus`.

- [ ] **Step 2: Run focused tests before implementation**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/MerchantManagement.spec.tsx
```

Expected before implementation: tests fail because the file is new and current copy is mojibake.

- [ ] **Step 3: Redesign component**

Implementation requirements:

- Keep `listMerchants`, `createUser`, `updateUser`, `setUserStatus`, and `Role.MERCHANT`.
- Use Fluent helper classes, white/gray surfaces, blue command buttons, compact table.
- Header helper: `管理入驻平台的商户、联系人与账号状态`.
- Search placeholder: `搜索商户名称或联系人`.
- Filter group aria-label: `状态筛选`.
- Filter labels: `全部`, `正常`, `已停用`.
- Table columns: `商户编号`, `企业名称`, `联系人 / 电话`, `地块数`, `确权面积`, `状态`, `入驻时间`, `操作`.
- Unknown phone fallback: `未填`.
- Area unit: `亩`.
- Empty: `暂无匹配商户`.
- Create success alert: `商户已创建。初始密码: ${res.initialPassword}，请转交商户并提醒尽快修改。`
- Confirm copy:
  - suspend: `确认停用该商户？停用后该账号将无法登录。`
  - activate: `确认启用该商户？`
- Dialog labels: `新增入驻商户`, `编辑商户档案`, `企业 / 商户名称`, `联系人 / 用户名`, `手机号码`, `取消`, `确认添加`, `保存修改`.
- Action accessible names should include display name.

- [ ] **Step 4: Verify focused tests pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/MerchantManagement.spec.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/MerchantManagement.tsx packages/web/src/components/MerchantManagement.spec.tsx
git commit -m "feat(web): redesign merchant management fluent table"
```

---

### Task 4: AI provider page Fluent polish

**Files:**
- Modify: `packages/web/src/components/AiProviders.tsx`
- Modify: `packages/web/src/components/AiProviderModal.tsx`
- Modify: `packages/web/src/components/AiPlayground.tsx`
- Create/Modify: `packages/web/src/components/AiProviders.spec.tsx`

- [ ] **Step 1: Add behavior tests**

Create tests that mock `../api/ai-provider`, `./AiProviderModal`, and `./AiPlayground`, and verify:

- Header `AI 服务商管理` and command `新增服务商`.
- Empty state: `暂无 AI 服务商，点击右上角新增。`
- Toggle calls `updateAiProvider(id, { enabled: !enabled })`.
- Delete confirmation copy is readable and calls `deleteAiProvider(id)` only when confirmed.
- Test action displays `测试中...`, then success `连接正常` or failure text.
- Child playground mock renders.

- [ ] **Step 2: Run focused tests before implementation**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/AiProviders.spec.tsx
```

Expected before implementation: tests fail because the file is new and current copy is mojibake/green-heavy.

- [ ] **Step 3: Redesign visible AI provider surfaces**

Implementation requirements:

- Keep all API calls and modal/playground behavior.
- Replace obvious emerald button/focus styles with Microsoft blue `#0078D4`.
- Header helper: `配置大模型服务接入，密钥加密存储；同租户仅一个服务商可启用。`
- Table columns: `名称`, `Base URL`, `文本模型`, `视觉模型`, `密钥`, `启用`, `操作`.
- Fallback for missing vision model: `-`.
- Test result copy:
  - loading `测试中...`
  - success `连接正常 {latencyMs ?? '-'}ms`
  - failure fallback `失败`
- Delete confirm: `确定删除该 AI 服务商？此操作不可撤销。`
- Loading: `加载中...`
- Error: `加载失败: {error}` and `重试`.
- `AiProviderModal` visible copy should be readable and not green-focused.
- `AiPlayground` should remain truthful: text dialog, disease diagnosis, batch diagnosis; no fake success.

- [ ] **Step 4: Verify focused tests pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/AiProviders.spec.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/web/src/components/AiProviders.tsx packages/web/src/components/AiProviderModal.tsx packages/web/src/components/AiPlayground.tsx packages/web/src/components/AiProviders.spec.tsx
git commit -m "feat(web): polish ai provider fluent settings"
```

---

### Task 5: Final review, QA, and completion

**Files:**
- No expected source edits unless review or QA finds a real issue.

- [ ] **Step 1: Run targeted P3 tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx src/components/AppLogin.spec.tsx src/components/AgentManagement.spec.tsx src/components/MerchantManagement.spec.tsx src/components/AiProviders.spec.tsx
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 test:unit
```

Expected:

- web tests pass.
- web lint/typecheck passes.
- full backend/web/miniapp unit suite passes.

- [ ] **Step 3: Browser QA**

Start local web dev server:

```powershell
corepack pnpm@10.33.2 --filter web dev -- --host 127.0.0.1 --port 5173
```

Check desktop `1440x900` and mobile `390x844`:

- Login page displays readable text and Fluent blue-neutral styling.
- Authenticated shell displays readable app/nav/role/search/logout copy.
- Agent management, merchant management, and AI provider pages render without horizontal body overflow or text overlap.
- Backend unavailable errors are reported honestly as environment limits.

- [ ] **Step 4: Request final review**

Dispatch code review for the P3 diff. Fix Critical and Important findings. Record any Minor findings for later if not blocking.

- [ ] **Step 5: Commit any QA fixes**

If QA/review required source edits:

```powershell
git add <changed-files>
git commit -m "fix(web): polish fluent p3 qa findings"
```

- [ ] **Step 6: Final status**

Report:

- P3 commits.
- Verification evidence.
- Browser QA evidence and environment limitations.
- Remaining known out-of-scope UI debt.

## Self-Review

Spec coverage: This plan addresses the most visible remaining global defects after P2: shell/login mojibake, secondary admin page old styling, and AI provider settings old green-heavy styling.

Placeholder scan: No `TBD`, `TODO`, or unspecified "add tests" placeholders remain. Each task lists concrete files, copy, commands, and expected behavior.

Type consistency: All API functions, DTOs, enum names, and tab ids match current source discovery: `listAgents`, `createAgent`, `updateAgent`, `setAgentStatus`, `listMerchants`, `createUser`, `updateUser`, `setUserStatus`, `Role.MERCHANT`, `listAiProviders`, `updateAiProvider`, `deleteAiProvider`, `testAiProvider`.

Risk notes:

- The P3 copy fixes intentionally introduce readable Chinese in files that already render Chinese UI.
- Browser QA may still show `请求失败 (500)` if the backend is not running; this is acceptable only when the page renders clear error states.
