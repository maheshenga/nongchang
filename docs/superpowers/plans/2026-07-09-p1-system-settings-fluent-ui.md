# System Settings Fluent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the system OSS configuration page into the Microsoft/Fluent UI system while preserving the existing OSS configuration behavior and API contract.

**Architecture:** Keep `SystemSettings` as a single focused component because this slice only changes one bounded settings surface. Reuse the existing shared Fluent helpers from `packages/web/src/ui/fluent.ts` and shared state components from `packages/web/src/ui/state.tsx`; do not introduce new design primitives or API wrappers.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind utility classes, lucide-react, existing `useApi` hook, existing OSS config API client.

## Global Constraints

- Use CodeGraph before grep/file discovery because `.codegraph/` exists at the repository root.
- Use `corepack pnpm@10.33.2 ...` for verification commands.
- Use TDD: write the failing test, run it red, implement, then run it green.
- Keep the OSS API contract unchanged: `getOssConfig`, `upsertOssConfig`, and `testOssConfig` stay in `packages/web/src/api/oss-config.ts`.
- Preserve secret behavior: an empty `accessKeySecret` input must not be sent in `upsertOssConfig`.
- Preserve required fields: `region`, `bucket`, and `accessKeyId` remain required.
- Preserve `autoComplete="new-password"` for `AccessKeySecret`.
- Do not change backend, database schema, routes, DTOs, or app navigation in this P1 slice.
- Replace old visual language in `SystemSettings.tsx`: no `slate-`, `emerald-`, `rose-`, `rounded-2xl`, `rounded-lg`, `bg-emerald`, `hover:bg-emerald`, `text-emerald`, `focus:ring-emerald`, `✓`, or `✗`.
- Use existing Fluent helpers: `fluentButton`, `fluentInput`, `fluentStatusTag`, `LoadingState`, and `ErrorState`.

---

### Task 1: SystemSettings Fluent UI Regression Test

**Files:**
- Create: `packages/web/src/components/SystemSettings.fluent-ui.spec.tsx`
- Read-only reference: `packages/web/src/components/SystemSettings.tsx`
- Read-only reference: `packages/web/src/api/oss-config.ts`

**Interfaces:**
- Consumes: `getOssConfig(): Promise<OssConfigView | null>`, `upsertOssConfig(input: OssConfigInput): Promise<OssConfigView>`, `testOssConfig(): Promise<AiTestResponse>`
- Produces: A component regression spec proving the Fluent UI boundary and behavior-preserving OSS form interactions.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/SystemSettings.fluent-ui.spec.tsx` with these checks:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemSettings from './SystemSettings';

const apiMocks = vi.hoisted(() => ({
  getOssConfig: vi.fn(),
  upsertOssConfig: vi.fn(),
  testOssConfig: vi.fn(),
}));

vi.mock('../api/oss-config', () => apiMocks);

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'SystemSettings.tsx');

describe('SystemSettings Fluent UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getOssConfig.mockResolvedValue({
      region: 'oss-cn-hangzhou',
      bucket: 'farm-assets',
      accessKeyId: 'LTAI-mask',
      accessKeySecretMasked: 'sk-****1234',
      baseUrl: 'https://cdn.example.com',
      enabled: true,
    });
    apiMocks.upsertOssConfig.mockResolvedValue({
      region: 'oss-cn-shanghai',
      bucket: 'farm-assets-prod',
      accessKeyId: 'LTAI-new',
      accessKeySecretMasked: 'sk-****1234',
      baseUrl: 'https://cdn.example.com/assets',
      enabled: true,
    });
    apiMocks.testOssConfig.mockResolvedValue({ ok: true, latencyMs: 23 });
  });

  it('keeps the source inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('fluentStatusTag');
    expect(source).not.toMatch(/slate-|emerald-|rose-|rounded-2xl|rounded-lg|bg-emerald|hover:bg-emerald|text-emerald|focus:ring-emerald|✓|✗/);
  });

  it('renders current OSS config, saves trimmed values without overwriting an empty secret, and tests connection', async () => {
    render(<SystemSettings />);

    expect(await screen.findByDisplayValue('oss-cn-hangzhou')).toBeInTheDocument();
    expect(screen.getByDisplayValue('farm-assets')).toBeInTheDocument();
    expect(screen.getByText('AccessKeySecret（当前 sk-****1234，留空不改）')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Region'), { target: { value: ' oss-cn-shanghai ' } });
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: ' farm-assets-prod ' } });
    fireEvent.change(screen.getByLabelText('AccessKeyId'), { target: { value: ' LTAI-new ' } });
    fireEvent.change(screen.getByLabelText('Base URL（可选，自定义访问域名）'), {
      target: { value: ' https://cdn.example.com/assets ' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertOssConfig).toHaveBeenCalledWith({
        region: 'oss-cn-shanghai',
        bucket: 'farm-assets-prod',
        accessKeyId: 'LTAI-new',
        baseUrl: 'https://cdn.example.com/assets',
        enabled: true,
      });
    });
    expect(apiMocks.upsertOssConfig.mock.calls[0][0]).not.toHaveProperty('accessKeySecret');

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(apiMocks.testOssConfig).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('连接正常 23ms')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemSettings.fluent-ui.spec.tsx
```

Expected: FAIL because `SystemSettings.tsx` still contains old UI tokens and does not import the Fluent helpers/state components.

### Task 2: Refactor SystemSettings to Fluent UI

**Files:**
- Modify: `packages/web/src/components/SystemSettings.tsx`
- Test: `packages/web/src/components/SystemSettings.fluent-ui.spec.tsx`

**Interfaces:**
- Consumes: the same OSS config API functions and `useApi(getOssConfig)` behavior.
- Produces: a Fluent settings panel with the same form semantics and API payload behavior.

- [ ] **Step 1: Replace imports and local class constants**

In `SystemSettings.tsx`, replace old visual imports and class constants with:

```tsx
import { useState, useEffect, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, CloudCog, Loader2, Save, ShieldCheck } from 'lucide-react';
import type { OssConfigInput, AiTestResponse } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { getOssConfig, upsertOssConfig, testOssConfig } from '../api/oss-config';
import { fluentButton, fluentFocus, fluentInput, fluentStatusTag } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';

const labelCls = 'mb-1 block text-xs font-semibold text-[#605E5C]';
const helpTextCls = 'mt-1 text-xs leading-5 text-[#605E5C]';
const checkboxCls = `h-4 w-4 rounded-[4px] border-[#C8C6C4] text-[#0078D4] accent-[#0078D4] ${fluentFocus}`;
```

- [ ] **Step 2: Keep the existing form submit contract**

Change the submit signature to `const onSubmit = async (e: FormEvent) => { ... }`. Keep this payload logic unchanged:

```tsx
const dto: OssConfigInput = {
  region: form.region.trim(),
  bucket: form.bucket.trim(),
  accessKeyId: form.accessKeyId.trim(),
  baseUrl: form.baseUrl.trim() || undefined,
  enabled: form.enabled,
};
if (form.accessKeySecret.trim()) {
  dto.accessKeySecret = form.accessKeySecret.trim();
}
```

- [ ] **Step 3: Replace old loading and error blocks**

Use shared state components:

```tsx
{loading && <LoadingState label="加载 OSS 配置" />}
{error && <ErrorState title="OSS 配置加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" />}
```

- [ ] **Step 4: Render a Fluent settings surface**

Use a square, system-style panel:

```tsx
<div className="flex h-full flex-col overflow-hidden border border-[#E1DFDD] bg-white">
  <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
        <CloudCog className="h-5 w-5 text-[#0078D4]" />
        AI 与存储设置
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#605E5C]">
        阿里云 OSS 用于小程序和后台图片上传。未配置或未启用时，服务端继续使用环境变量兜底。
      </p>
    </div>
    <span className={fluentStatusTag(form.enabled ? 'active' : 'neutral')}>
      {form.enabled ? 'OSS 已启用' : '环境变量兜底'}
    </span>
  </div>
  ...
</div>
```

- [ ] **Step 5: Render inputs with labels and accessible names**

Every field must have `htmlFor`/`id` so tests and assistive tech can use labels:

```tsx
<label htmlFor="oss-region" className={labelCls}>Region</label>
<input id="oss-region" className={`${fluentInput} w-full`} ... />
```

Apply this to `Region`, `Bucket`, `AccessKeyId`, `AccessKeySecret`, and `Base URL（可选，自定义访问域名）`.

- [ ] **Step 6: Replace buttons and status feedback**

Use Fluent buttons and icon status tags:

```tsx
<button type="submit" disabled={submitting} className={fluentButton('primary')}>
  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
  保存配置
</button>
<button type="button" onClick={() => void onTest()} disabled={test === 'loading'} className={fluentButton('secondary')}>
  {test === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
  测试连接
</button>
{saveMsg && <span className={fluentStatusTag('success')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{saveMsg}</span>}
{test && test !== 'loading' && test.ok && <span className={fluentStatusTag('success')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />连接正常 {test.latencyMs ?? '-'}ms</span>}
{test && test !== 'loading' && !test.ok && <span className={fluentStatusTag('danger')}><AlertTriangle className="mr-1 h-3.5 w-3.5" />{test.error ?? '失败'}</span>}
```

- [ ] **Step 7: Run focused green test**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/SystemSettings.fluent-ui.spec.tsx src/api/oss-config.spec.ts
```

Expected: PASS.

### Task 3: Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/SystemSettings.tsx`
- Verify: `packages/web/src/components/SystemSettings.fluent-ui.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-system-settings-fluent-ui.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2.
- Produces: a reviewed and committed P1 slice.

- [ ] **Step 1: Run full web verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform local review**

Review the diff and confirm:

```bash
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/SystemSettings.tsx packages/web/src/components/SystemSettings.fluent-ui.spec.tsx docs/superpowers/plans/2026-07-09-p1-system-settings-fluent-ui.md
```

Checklist:
- `SystemSettings.tsx` no longer contains old visual tokens listed in Global Constraints.
- Existing OSS behavior is preserved: load, save, retry, test connection, masked secret label, empty secret omission.
- No backend/API/schema/navigation changes are present.

- [ ] **Step 3: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-system-settings-fluent-ui.md packages/web/src/components/SystemSettings.tsx packages/web/src/components/SystemSettings.fluent-ui.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align system settings with Fluent UI"
```

Expected: commit succeeds with only the plan, test, and `SystemSettings.tsx` changes.

## Self-Review

- Spec coverage: The plan covers the requested P-first workflow, uses Superpowers planning, requires TDD, preserves OSS behavior, performs verification, reviews the diff, and commits.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or incomplete generic testing instructions remain.
- Type consistency: Test mocks use the same `OssConfigView`, `OssConfigInput`, and `AiTestResponse` shapes consumed by `SystemSettings` and `oss-config.ts`.
