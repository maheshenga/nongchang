# BatchAdmin Fluent Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the next P1 slice of the SaaS UI system by removing production-visible legacy visual debt and over-claiming copy from the BatchAdmin deep workflows while preserving real batch, trace-code, export, detail, and delete behavior.

**Architecture:** Keep `BatchAdmin` on the existing React/Vite/Tailwind stack and real API wrappers. Add a source-level regression spec before touching production code, then refactor only the deep surfaces that remain visually or textually inconsistent: modal shells, QR/code generation panels, destructive confirmation, and report/compliance copy. Reuse `fluentButton`, `fluentInput`, `fluentSelect`, `fluentTable`, `fluentStatusTag`, and shared state components instead of inventing a new design layer.

**Tech Stack:** React 19, Vite 6, TypeScript 5.8, Tailwind 4 utility classes, Vitest, Testing Library, `lucide-react`, `qrcode.react`, existing `@nongchang/shared` DTOs and `packages/web/src/api/*` wrappers.

## Global Constraints

- Use `corepack pnpm@10.33.2` for package commands.
- Do not change backend DTOs, Prisma schema, billing/trace API contracts, or role/navigation permissions in this P1 UI slice.
- Keep the Microsoft Fluent direction from `docs/superpowers/specs/2026-07-06-microsoft-fluent-ui-redesign.md`: light-first neutral workspace, Microsoft blue `#0078D4`, compact density, 1px separators, radius mostly `4px` to `8px`, no emerald/green gradient shell, no marketing hero, no fake metrics.
- Preserve real workflows in `BatchAdmin`: `listBatches`, `listFields`, `createBatch`, `getBatchLifecycle`, `generateCodes`, `listCodes`, `deleteBatch`, CSV export, browser print, clipboard copy, and request-key reuse.
- Do not display unsupported cryptographic, blockchain, government certification, or automatic compliance guarantees. Copy must say what the current real API proves.
- Use TDD: no production code changes before a failing test is observed.
- Use `apply_patch` for manual edits.
- Leave unrelated files and user changes untouched.

---

### Task 1: BatchAdmin Deep Surface Regression Spec

**Files:**
- Create: `packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx`
- Modify: none
- Test: `packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx`

**Interfaces:**
- Consumes: `packages/web/src/components/BatchAdmin.tsx` source text.
- Produces: Regression checks that later tasks must satisfy before production code can be considered aligned.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx` with this content:

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/components/BatchAdmin.tsx'), 'utf8');

describe('BatchAdmin Fluent deep surfaces', () => {
  it('keeps production-visible deep workflows out of the legacy emerald card style', () => {
    const text = source();

    const forbiddenTokens = [
      'rounded-2xl',
      'rounded-xl',
      'rounded-3xl',
      'bg-emerald',
      'hover:bg-emerald',
      'text-emerald',
      'border-emerald',
      'shadow-emerald',
      'bg-gradient-to-r',
      'bg-gradient-to-br',
      'shadow-2xl',
    ];

    for (const token of forbiddenTokens) {
      expect(text).not.toContain(token);
    }
  });

  it('does not imply unsupported certification or cryptographic guarantees in batch labels and reports', () => {
    const text = source();

    const unsupportedClaims = [
      '官方政府防伪',
      '政府防伪',
      '高级矢量排版控制器',
      '防撕 Logo',
      '一键生成溯源报告 ->',
    ];

    for (const claim of unsupportedClaims) {
      expect(text).not.toContain(claim);
    }
  });

  it('uses real API language for trace-code generation and export actions', () => {
    const text = source();

    expect(text).toContain('生成真实溯源码');
    expect(text).toContain('导出溯源报告');
    expect(text).toContain('数据来源于批次、农事记录、溯源事件与扫码统计接口');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.fluent-depth.spec.tsx
```

Expected: FAIL because current `BatchAdmin.tsx` still contains legacy tokens such as `rounded-xl`, `bg-emerald`, `text-emerald`, `shadow-2xl`, and unsupported copy such as `官方政府防伪`.

- [ ] **Step 3: Commit is deferred**

Do not commit this red test alone. Continue to Task 2 and commit the complete passing P1 slice.

### Task 2: BatchAdmin Deep Fluent Cleanup

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Test: `packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx`
- Test: `packages/web/src/components/BatchAdmin.spec.tsx`
- Test: `packages/web/src/components/BatchAdmin.model.spec.ts`

**Interfaces:**
- Consumes: existing `BatchAdmin` state, helpers, and API calls.
- Produces: same exported `BatchAdmin` component with Fluent-aligned deep surfaces and truthful copy.

- [ ] **Step 1: Replace unsupported export/report wording**

In `handleExportBatchReport`, change the pending action title from:

```tsx
title: `一键生成溯源报告 -> ${batch?.code ?? id}`,
```

to:

```tsx
title: `导出溯源报告: ${batch?.code ?? id}`,
```

Change the description to:

```tsx
description: '数据来源于批次、农事记录、溯源事件与扫码统计接口,将导出为可用 Excel 打开的 CSV 文件。',
```

- [ ] **Step 2: Replace unsupported QR label/control copy**

In the QR generation modal and print/layout preview surfaces:

```tsx
高级矢量排版控制器
强制印制官方政府防伪溯源防撕 Logo 栏
```

must become truthful operational copy:

```tsx
标签排版参数
显示平台标识栏
```

The primary generation action must include:

```tsx
生成真实溯源码
```

Do not change `handleGenerateCodes`, `createTraceGenerationRequestKey`, or `generateCodes` behavior.

- [ ] **Step 3: Replace remaining legacy visual tokens in production-visible BatchAdmin JSX**

Replace old card-heavy or green-gradient tokens with Fluent-compatible classes:

```tsx
rounded-2xl -> rounded-[6px] or rounded-[4px]
rounded-xl -> rounded-[6px] or rounded-[4px]
bg-emerald-* -> bg-[#E5F1FB] or bg-[#DFF6DD] when semantic success is required
text-emerald-* -> text-[#0078D4] or text-[#107C10] when semantic success is required
border-emerald-* -> border-[#E1DFDD] or border-[#107C10] when semantic success is required
bg-gradient-to-r/from-blue-50/to-indigo-50 -> bg-[#EFF6FC]
shadow-2xl -> shadow-lg or no shadow for modals
```

Preserve focus, disabled, loading, destructive confirmation, and responsive wrapping.

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.fluent-depth.spec.tsx src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.model.spec.ts
```

Expected: PASS.

### Task 3: Verification, Review, and Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-09-p1-batch-admin-fluent-depth.md`
- Modify/Create from previous tasks.

**Interfaces:**
- Consumes: passing focused tests and clean git diff.
- Produces: one commit for the P1 BatchAdmin Fluent depth slice.

- [ ] **Step 1: Run broader verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:

- `web lint`: PASS.
- `web test`: PASS with all web Vitest files passing.
- `git diff --check`: no whitespace errors.

- [ ] **Step 2: Review the diff**

Run:

```bash
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx docs/superpowers/plans/2026-07-09-p1-batch-admin-fluent-depth.md
```

Confirm:

- No API contract changes.
- No role/navigation changes.
- No deletion of safeguards around generated-code deletion.
- No new fake metrics or unsupported claims.
- No unrelated formatting churn.

- [ ] **Step 3: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-batch-admin-fluent-depth.md packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.fluent-depth.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align batch admin deep surfaces with Fluent UI"
```

Expected: commit succeeds on the current branch.

## Self-Review

**Spec coverage:** The plan covers the P1 audit item for `BatchAdmin` Fluent depth, truthful production copy, TDD, verification, and commit. It intentionally does not change backend contracts, navigation, or unrelated pages.

**Placeholder scan:** No TBD/TODO/fill-in placeholders are present. Each task includes exact files, commands, and expected outcomes.

**Type consistency:** The plan preserves the existing `BatchAdmin` default export and existing API function names. The new spec reads source text only and does not require new production types.
