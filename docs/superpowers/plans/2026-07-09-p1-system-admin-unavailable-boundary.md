# SystemAdmin Unavailable Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SystemAdmin` truthful by removing action-like controls from unavailable platform capabilities while preserving the real agent list and create-agent flow.

**Architecture:** Keep the change scoped to the existing `SystemAdmin` component and its focused tests. Replace unavailable feature toggles, fake sensitive confirmations, and overclaiming copy with static Fluent-style status rows. Preserve API-backed agent loading, filtering, selection, batch-action notices, and `CreateAgentModal`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind utility classes, local Fluent helpers from `packages/web/src/ui/fluent.ts`.

## Global Constraints

- Repository root: `E:/code/nongchang`.
- Use CodeGraph before grep/file discovery when understanding indexed code.
- Use `corepack pnpm@10.33.2 ...` for package commands.
- Do not change backend APIs or database schema for this P1 slice.
- Do not remove real `listAgents` / `createAgent` behavior.
- Do not show unavailable backend capabilities as clickable toggles, runnable confirmations, or successful mutations.
- Preserve existing truthfulness boundaries: no fake live metrics, no `Math.random` generated production data.
- Use `apply_patch` for manual edits.

---

### Task 1: Add SystemAdmin Unavailable Boundary Regression Test

**Files:**
- Create: `packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx`
- Read-only reference: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`
- Read-only reference: `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx`
- Modify later: `packages/web/src/components/SystemAdmin.tsx`

**Interfaces:**
- Consumes: `SystemAdmin` default export from `./SystemAdmin`.
- Consumes mocked API: `listAgents(): Promise<ApiAgent[]>`, `createAgent(dto): Promise<ApiAgent>`.
- Produces: a regression contract that unavailable system services render as static status text and source no longer contains unavailable action handlers or overclaiming terms.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx` with:

```tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import SystemAdmin from './SystemAdmin';

const agentMocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  createAgent: vi.fn(),
}));

vi.mock('../api/agents', () => agentMocks);
vi.mock('../hooks/useToast', () => ({ showToast: vi.fn() }));

const sourcePath = resolve(__dirname, 'SystemAdmin.tsx');

describe('SystemAdmin unavailable capability boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentMocks.listAgents.mockResolvedValue([
      {
        id: 'agent-1',
        tenantId: 'tenant-1',
        name: 'North Agent',
        region: 'North',
        status: 'active',
        merchantCount: 2,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    agentMocks.createAgent.mockResolvedValue({
      id: 'agent-new',
      tenantId: 'tenant-1',
      name: 'New Agent',
      region: 'East',
      status: 'active',
      merchantCount: 0,
      createdAt: '2026-07-02T00:00:00.000Z',
    });
  });

  test('does not expose unavailable platform capabilities as clickable actions', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('handleSensitiveAction');
    expect(source).not.toContain('confirmAction');
    expect(source).not.toContain('showConfirmModal');
    expect(source).not.toContain('actionPending');

    for (const phrase of [
      '区块链',
      '上链',
      '存证',
      '智能合约',
      '快照',
      '主网',
      '自动放行',
      '无限级',
      '流通全链路',
      '立即触发',
    ]) {
      expect(source).not.toContain(phrase);
    }
  });

  test('renders unavailable services as status surfaces, while preserving real agent management', async () => {
    render(<SystemAdmin />);

    expect(await screen.findByText('North Agent')).toBeTruthy();

    for (const service of [
      '系统级 AI 农业助理',
      'IoT 物联网数据总线',
      '消费者端防伪溯源 H5',
      '跨国节点多语言支持',
    ]) {
      const row = screen.getByText(service).closest('div');
      expect(row).toBeTruthy();
      expect(within(row as HTMLElement).queryByRole('button')).toBeNull();
    }

    expect(screen.queryByRole('dialog', { name: '安全二次确认' })).toBeNull();
    expect(screen.getByText('备份任务接口待接入')).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增代理' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.unavailable-boundary.spec.tsx
```

Expected: FAIL because `SystemAdmin.tsx` still contains `handleSensitiveAction`, `showConfirmModal`, action-like unavailable toggles, and overclaiming phrases such as `区块链` / `智能合约` / `自动放行`.

- [ ] **Step 3: Commit only after Task 2 passes**

Do not commit at this task boundary until implementation and verification are complete, because this is a single P1 slice.

### Task 2: Replace Unavailable Actions With Static Fluent Status Surfaces

**Files:**
- Modify: `packages/web/src/components/SystemAdmin.tsx`
- Test: `packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx`
- Existing tests: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`, `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx`

**Interfaces:**
- Consumes: `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, `fluentTable`.
- Produces: `SystemAdmin` with no sensitive-action confirm modal and no fake mutations for unavailable capabilities.

- [ ] **Step 1: Remove unused unavailable-action state and handlers**

Delete these declarations from `SystemAdmin`:

```tsx
const [showConfirmModal, setShowConfirmModal] = useState(false);
const [actionPending, setActionPending] = useState('');

const handleSensitiveAction = (action: string) => {
  setActionPending(action);
  setShowConfirmModal(true);
};

const confirmAction = () => {
  setShowConfirmModal(false);
  showToast(`该操作待后端接入：${actionPending}`);
};
```

Keep `handleBatchAction` because it is a real selected-agent affordance that clearly says the backend is pending.

- [ ] **Step 2: Make global feature services static**

Replace the feature data and toggle button with static rows:

```tsx
{[
  { name: '系统级 AI 农业助理', note: '需接入真实 AI 调用统计与额度接口' },
  { name: 'IoT 物联网数据总线', note: '需接入真实设备运行接口' },
  { name: '消费者端防伪溯源 H5', note: '需接入真实扫码统计与访问分析接口' },
  { name: '跨国节点多语言支持', note: '模块尚未激活，需部署海外边缘节点' },
].map((feature) => (
  <div key={feature.name} className="flex flex-col gap-3 rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="h-2 w-2 rounded-full bg-[#C8C6C4]" />
        <div className="text-sm font-semibold text-[#242424]">{feature.name}</div>
      </div>
      <span className={fluentStatusTag('neutral')}>待接入</span>
    </div>
    <div className="text-xs leading-5 text-[#605E5C]">{feature.note}</div>
  </div>
))}
```

- [ ] **Step 3: Make approval flows static and truthful**

Change the third flow role from `养护/质检数据上链` to `养护/质检数据归档`. Remove `onClick`, `cursor-pointer`, hover action classes, and replace `自动放行` with `策略待接入`:

```tsx
{[
  { role: '溯源码生成审批', assignees: '平台超管, 财务主管', required: true },
  { role: '核心分销商入驻', assignees: '渠道总监', required: true },
  { role: '养护/质检数据归档', assignees: '基地质检员, 芍药圃主管', required: false },
].map((flow) => (
  <div key={flow.role} className="flex flex-col gap-2.5 rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] p-4">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-[#242424]">{flow.role}</span>
      <span className={fluentStatusTag(flow.required ? 'warning' : 'neutral')}>
        {flow.required ? <Lock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        {flow.required ? '需双重验证' : '策略待接入'}
      </span>
    </div>
    <div className="flex items-center gap-1.5 text-xs text-[#605E5C]">
      <span>流转节点:</span>
      <span className="font-semibold text-[#242424]">{flow.assignees}</span>
    </div>
  </div>
))}
```

Replace the add-flow button with a non-clickable note:

```tsx
<div className="rounded-[4px] border border-dashed border-[#C8C6C4] bg-white px-3 py-2 text-xs font-semibold text-[#605E5C]">
  新审批流配置接口待接入
</div>
```

- [ ] **Step 4: Make security policy and backup unavailable states static**

Replace clickable 2FA / strict trace toggles with static status tags. Replace backup action with a static info row:

```tsx
<p className="text-xs text-[#605E5C]">平台安全策略配置入口</p>
```

```tsx
<div className="rounded-[4px] border border-[#E1DFDD] bg-white p-4">
  <div className="flex items-center justify-between gap-3">
    <div className="text-sm font-semibold text-[#242424]">强制全员双重认证 (2FA)</div>
    <span className={fluentStatusTag('neutral')}>接口待接入</span>
  </div>
  <div className="mt-2 text-xs text-[#605E5C]">需要真实认证服务和租户策略接口后再允许启停。</div>
</div>
<div className="rounded-[4px] border border-[#E1DFDD] bg-white p-4">
  <div className="flex items-center justify-between gap-3">
    <div className="text-sm font-semibold text-[#242424]">严格防伪溯源流转模式</div>
    <span className={fluentStatusTag('neutral')}>接口待接入</span>
  </div>
  <div className="mt-2 text-xs text-[#605E5C]">需要真实出入库流转校验接口后再允许启停。</div>
</div>
<div className="flex items-center justify-center gap-2 rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-3 text-xs font-semibold text-[#605E5C]">
  <DatabaseBackup className="h-4 w-4 text-[#605E5C]" />
  备份任务接口待接入
</div>
```

- [ ] **Step 5: Fix agent-network overclaiming copy and unavailable per-agent actions**

Replace:

```tsx
系统支持无限级树形结构代理与商品终端流通全链路追踪
```

with:

```tsx
代理商列表来自真实接口；层级与流通追踪按后端接口接入情况展示。
```

Replace per-agent buttons that call `handleSensitiveAction` with static labels:

```tsx
<span className="rounded-[4px] border border-[#E1DFDD] bg-white px-3 py-1.5 text-xs font-semibold text-[#605E5C]">数据穿透待接入</span>
<span className="rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-1.5 text-xs font-semibold text-[#605E5C]">权属调整待接入</span>
```

- [ ] **Step 6: Replace other unavailable buttons**

Replace `手工盘点录入入口` and `导出审计报告` buttons with static status text:

```tsx
<span className={fluentStatusTag('neutral')}>录入接口待接入</span>
```

```tsx
<span className={fluentStatusTag('neutral')}>导出报告待接入</span>
```

- [ ] **Step 7: Remove confirm modal JSX**

Delete the entire `showConfirmModal && (...)` block labelled `安全二次确认`. This modal has no real backend action and should not appear for unavailable capabilities.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.unavailable-boundary.spec.tsx src/components/SystemAdmin.truthfulness.spec.tsx src/components/SystemAdmin.fluent-ui.spec.tsx
```

Expected: PASS.

### Task 3: Verify, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/SystemAdmin.tsx`
- Verify: `packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-system-admin-unavailable-boundary.md`

**Interfaces:**
- Produces: one clean commit for this P1 slice.

- [ ] **Step 1: Run broad Web checks**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- `tsc --noEmit` exits 0.
- Vitest reports all Web tests passing.
- `git diff --check` exits 0.

- [ ] **Step 2: Manual diff review**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/SystemAdmin.tsx packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx docs/superpowers/plans/2026-07-09-p1-system-admin-unavailable-boundary.md
```

Confirm:
- No backend/API/schema files changed.
- No `handleSensitiveAction`, `confirmAction`, `showConfirmModal`, or `actionPending` remains in `SystemAdmin.tsx`.
- Real `listAgents`, `createAgent`, `reloadAgents`, filtering, selection, and create modal remain.
- Unavailable capabilities render as text/status, not clickable toggles.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-system-admin-unavailable-boundary.md packages/web/src/components/SystemAdmin.tsx packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): make system admin unavailable capabilities explicit"
```

Expected: commit succeeds and `git status --short --branch` shows a clean worktree on `codex/p1-truthful-product-copy`.

## Self-Review

1. Spec coverage: This plan covers the P1 audit finding that `SystemAdmin` exposes unavailable platform capabilities as actions. It preserves real agent management and does not expand scope to backend APIs or unrelated UI pages.
2. Placeholder scan: The plan contains concrete files, commands, expected failures, expected passing checks, and exact code snippets for the behavioral changes.
3. Type consistency: The test uses existing `SystemAdmin`, mocked `listAgents`, mocked `createAgent`, and source-level checks against `SystemAdmin.tsx`. No new production interfaces are introduced.
