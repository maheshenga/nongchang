# SystemAdmin Fluent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `SystemAdmin` into the existing Microsoft Fluent-inspired UI system without changing its backend contracts or truthfulness boundaries.

**Architecture:** Keep the slice focused on `packages/web/src/components/SystemAdmin.tsx`. Replace the remaining legacy rounded-2xl, colorful card-stack shell with existing shared Fluent primitives from `packages/web/src/ui/fluent.ts`, while preserving real agent API behavior and the pending-integration copy introduced in P1. Add a source-level regression test that prevents the old SystemAdmin-only shell from drifting back.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utility classes, lucide-react, existing local `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, and `fluentTable` helpers.

## Global Constraints

- Do not change backend APIs, shared DTOs, role navigation, auth behavior, agent API wrappers, or API request behavior.
- Preserve real agent API wiring: `listAgents` and `createAgent` continue to drive the agent list and create-agent modal.
- Preserve P1 truthfulness boundaries: unsupported monitoring, automation, warehouse environment, inventory, and audit capabilities must stay explicitly pending integration.
- Do not introduce new dependencies.
- Do not perform broad redesign of unrelated pages in this slice.
- Use TDD: write failing tests before production component changes and verify red/green steps.
- Because subagent tools are not exposed in this Codex session, execute inline while following the same task/review gates.
- `apply_patch` is unavailable in this Windows app session (`Access is denied`), so use controlled UTF-8 PowerShell file rewrites for edits and verify text integrity after each write.

---

### Task 1: Add SystemAdmin Fluent UI Regression Coverage

**Files:**
- Create: `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx`
- Modify later: `packages/web/src/components/SystemAdmin.tsx`

**Interfaces:**
- Consumes: current `SystemAdmin` source file as UTF-8 text.
- Produces: Tests that fail while the component still uses legacy SystemAdmin-only visual shell classes and pass after the component uses shared Fluent helpers.

- [ ] **Step 1: Write the failing source regression test**

Create `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx` with:

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/components/SystemAdmin.tsx'), 'utf8');

describe('SystemAdmin Fluent UI shell', () => {
  it('uses shared Fluent primitives instead of legacy card shell utilities', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain('fluentButton');
    expect(text).toContain('fluentInput');
    expect(text).toContain('fluentSelect');
    expect(text).toContain('fluentStatusTag');
    expect(text).toContain('fluentTable');

    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('shadow-lg');
    expect(text).not.toContain('shadow-md');
    expect(text).not.toContain('bg-emerald-600 hover:bg-emerald-700');
    expect(text).not.toContain('bg-slate-50/70');
  });
});
```

- [ ] **Step 2: Run the test to verify red**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.fluent-ui.spec.tsx`

Expected: FAIL because current `SystemAdmin.tsx` still contains legacy `rounded-2xl` / `rounded-xl` classes and does not import all shared Fluent helpers.

---

### Task 2: Refactor SystemAdmin Shell to Shared Fluent Primitives

**Files:**
- Modify: `packages/web/src/components/SystemAdmin.tsx`
- Test: `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx`
- Test: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: existing `SystemAdmin` component, P1 pending-integration copy, `listAgents`, `createAgent`, and existing `fluent.ts` helpers.
- Produces: Same business behavior with a more consistent Microsoft-style operational UI shell.

- [ ] **Step 1: Import Fluent helpers**

Modify the import list in `SystemAdmin.tsx`:

```tsx
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
```

- [ ] **Step 2: Replace legacy page shell classes**

Use these class mappings throughout `SystemAdmin.tsx`:

```text
rounded-2xl -> rounded-[6px]
rounded-xl -> rounded-[4px]
shadow-lg -> shadow-sm
shadow-md -> shadow-sm
```

Also replace ad hoc button class strings with `fluentButton('primary')`, `fluentButton('secondary')`, `fluentButton('subtle')`, or `fluentButton('danger')` based on intent.

- [ ] **Step 3: Convert form controls to Fluent inputs/selects**

Apply:

```tsx
className={`${fluentInput} ...`}
className={`${fluentSelect} ...`}
```

Use `fluentInput` for text/number inputs and `fluentSelect` for status/level filters.

- [ ] **Step 4: Convert status badges and tables**

Use `fluentStatusTag('neutral')`, `fluentStatusTag('success')`, `fluentStatusTag('warning')`, or `fluentStatusTag('danger')` for compact status labels.

Use `fluentTable.table`, `fluentTable.thead`, `fluentTable.th`, `fluentTable.row`, and `fluentTable.td` for the agent table.

- [ ] **Step 5: Preserve truthfulness copy and real API actions**

After the visual refactor, verify the source still contains:

```text
listAgents
createAgent(dto)
运营监控待接入
暂无实时运营监控数据
仓储环境监测待接入
设备与耗材调度待接入
系统级操作审计待接入
当前仅显示待接入提示
```

- [ ] **Step 6: Run focused tests to verify green**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.fluent-ui.spec.tsx src/components/SystemAdmin.truthfulness.spec.tsx
```

Expected: PASS.

---

### Task 3: Slice Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/SystemAdmin.tsx`
- Verify: `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-08-p2-system-admin-fluent-ui.md`

**Interfaces:**
- Consumes: The changed component and tests from Tasks 1-2.
- Produces: A reviewed commit on the current branch.

- [ ] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemAdmin.fluent-ui.spec.tsx src/components/SystemAdmin.truthfulness.spec.tsx
```

Expected: PASS.

- [ ] **Step 2: Run Web verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: lint exits 0, all Web tests pass, and Vite build exits 0. Existing `DashboardDemo` chunk-size warning may remain because this slice does not modify it.

- [ ] **Step 3: Scan source integrity and residue**

Run:

```bash
node -e "const fs=require('fs'); const files=['packages/web/src/components/SystemAdmin.tsx','packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx','docs/superpowers/plans/2026-07-08-p2-system-admin-fluent-ui.md']; for (const f of files) { const s=fs.readFileSync(f,'utf8'); console.log(f, {hasReplacement:s.includes('\\uFFFD'), hasMojibake:s.includes('\\u6769\\u611f\\u60c0')||s.includes('\\u9344\\u7280\\u6d47')||s.includes('\\u9225')}); }"
rg -n "rounded-2xl|rounded-xl|shadow-lg|shadow-md|bg-emerald-600 hover:bg-emerald-700|bg-slate-50/70" packages/web/src/components/SystemAdmin.tsx
rg -n "MOCK_SERVER_DATA|Math\.random|unreadApprovals|archiveAlert|envAlarm|SYSTEM ONLINE|CPU 负载|导出 PDF 报告" packages/web/src/components/SystemAdmin.tsx
```

Expected: no replacement/mojibake markers; no legacy shell residue; no fake-operation residue.

- [ ] **Step 4: Review diff**

Run:

```bash
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/SystemAdmin.tsx packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx docs/superpowers/plans/2026-07-08-p2-system-admin-fluent-ui.md
```

Review checklist:
- No backend, shared DTO, auth, navigation, or API wrapper files changed.
- `listAgents` and `createAgent(dto)` remain in the component.
- Unsupported capabilities still display pending-integration copy instead of fake live success states.
- Component uses shared Fluent helpers for buttons, inputs, selects, status tags, and tables.
- The refactor does not introduce new dependencies.

- [ ] **Step 5: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-08-p2-system-admin-fluent-ui.md packages/web/src/components/SystemAdmin.tsx packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align SystemAdmin with Fluent UI shell"
```

Expected: commit created successfully.

## Self-Review

- Spec coverage: This plan targets the next P1/P2 UI-system defect from the SaaS audit: inconsistent Microsoft/Fluent styling in the high-risk SystemAdmin page after truthfulness cleanup.
- Placeholder scan: No placeholder red-flag terms remain.
- Type consistency: The plan uses existing `SystemAdmin`, `listAgents`, `createAgent`, and shared `fluent.ts` helper names visible in the current codebase.
- Scope check: This slice intentionally does not redesign BatchAdmin, MerchantAdmin, DashboardDemo, or global navigation. Those should remain separate priority slices.
