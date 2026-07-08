# Integration Settings Fluent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Web third-party integration settings page into the Microsoft/Fluent UI system while preserving real WeChat, Xfyun, and Tianditu configuration behavior.

**Architecture:** Keep this as a bounded component refactor of `IntegrationSettings.tsx`; do not change backend routes, shared DTOs, API clients, auth, roles, or app navigation. Reuse the local Fluent primitives from `packages/web/src/ui/fluent.ts` and shared state components from `packages/web/src/ui/state.tsx`; add one focused component spec that locks both the visual boundary and the credential-preserving save behavior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind utility classes, lucide-react, existing `useApi` hook, existing integration API client.

## Global Constraints

- Use CodeGraph before grep/file discovery because `.codegraph/` exists at the repository root.
- Use `corepack pnpm@10.33.2 ...` for verification commands.
- Use TDD: write the failing test, run it red, implement, then run it green.
- Keep API contracts unchanged: `getIntegrationConfig(provider)`, `upsertWechatConfig(input)`, `upsertXfyunConfig(input)`, and `upsertTiandituConfig(input)` stay unchanged.
- Preserve secret semantics: empty secret/key fields for WeChat and Xfyun must not overwrite existing masked credentials.
- Preserve trim semantics: AppID, APIKey, APISecret, WeChat secret, and Tianditu key are trimmed before submission when included.
- Do not change backend, database schema, shared DTOs, API clients, auth roles, or navigation in this P1 slice.
- Replace old visual language in `IntegrationSettings.tsx`: no `slate-`, `emerald-`, `rose-`, `rounded-2xl`, `rounded-xl`, `rounded-lg`, `shadow-xl`, `shadow-2xl`, `bg-emerald`, `hover:bg-emerald`, `text-emerald`, or `focus:ring-emerald`.
- Use existing Fluent helpers: `fluentButton`, `fluentFocus`, `fluentInput`, `fluentStatusTag`, `LoadingState`, and `ErrorState`.
- Add accessible labels for every editable input and checkbox.

---

### Task 1: IntegrationSettings Fluent UI Regression Test

**Files:**
- Create: `packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx`
- Read-only reference: `packages/web/src/components/IntegrationSettings.tsx`
- Read-only reference: `packages/web/src/api/integration.ts`
- Read-only reference: `packages/shared/src/dto/integration.dto.ts`

**Interfaces:**
- Consumes: `getIntegrationConfig(provider: IntegrationProvider): Promise<IntegrationConfigView | null>`
- Consumes: `upsertWechatConfig(input: WechatConfigInput): Promise<IntegrationConfigView>`
- Consumes: `upsertXfyunConfig(input: XfyunConfigInput): Promise<IntegrationConfigView>`
- Consumes: `upsertTiandituConfig(input: TiandituConfigInput): Promise<IntegrationConfigView>`
- Produces: a component regression spec proving Fluent UI boundary and credential-safe save behavior.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx` with this content:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IntegrationSettings from './IntegrationSettings';

const apiMocks = vi.hoisted(() => ({
  getIntegrationConfig: vi.fn(),
  upsertWechatConfig: vi.fn(),
  upsertXfyunConfig: vi.fn(),
  upsertTiandituConfig: vi.fn(),
}));

vi.mock('../api/integration', () => ({
  getIntegrationConfig: apiMocks.getIntegrationConfig,
  upsertWechatConfig: apiMocks.upsertWechatConfig,
  upsertXfyunConfig: apiMocks.upsertXfyunConfig,
  upsertTiandituConfig: apiMocks.upsertTiandituConfig,
}));

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'IntegrationSettings.tsx');

describe('IntegrationSettings Fluent UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getIntegrationConfig.mockImplementation((provider: string) => Promise.resolve({
      provider,
      appId: provider === 'tianditu' ? '  tianditu-key-old  ' : `${provider}-app-old`,
      secretMasked: provider === 'wechat' ? 'sec***old' : null,
      apiKeyMasked: provider === 'xfyun' ? 'key***old' : null,
      apiSecretMasked: provider === 'xfyun' ? 'secret***old' : null,
      enabled: provider !== 'tianditu',
    }));
    apiMocks.upsertWechatConfig.mockResolvedValue({ provider: 'wechat', appId: 'wx-new', secretMasked: 'sec***new', apiKeyMasked: null, apiSecretMasked: null, enabled: false });
    apiMocks.upsertXfyunConfig.mockResolvedValue({ provider: 'xfyun', appId: 'xfyun-new', secretMasked: null, apiKeyMasked: 'key***new', apiSecretMasked: 'secret***new', enabled: true });
    apiMocks.upsertTiandituConfig.mockResolvedValue({ provider: 'tianditu', appId: 'tk-new', secretMasked: null, apiKeyMasked: null, apiSecretMasked: null, enabled: true });
  });

  it('keeps the source inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('fluentStatusTag');
    const forbiddenClassTokens = [
      'text-slate-',
      'bg-slate-',
      'border-slate-',
      'ring-slate-',
      'text-emerald-',
      'bg-emerald-',
      'border-emerald-',
      'hover:bg-emerald-',
      'focus:ring-emerald-',
      'text-rose-',
      'bg-rose-',
      'border-rose-',
      'rounded-2xl',
      'rounded-xl',
      'rounded-lg',
      'shadow-xl',
      'shadow-2xl',
    ];
    for (const token of forbiddenClassTokens) {
      expect(source).not.toContain(token);
    }
  });

  it('saves integration settings without overwriting masked secrets left blank', async () => {
    render(<IntegrationSettings />);

    const wechatCard = await screen.findByRole('region', { name: '微信小程序登录' });
    fireEvent.change(within(wechatCard).getByLabelText('AppID'), { target: { value: ' wx-new ' } });
    fireEvent.click(within(wechatCard).getByLabelText('启用微信登录'));
    fireEvent.click(within(wechatCard).getByRole('button', { name: '保存微信配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertWechatConfig).toHaveBeenCalledWith({ appId: 'wx-new', enabled: false });
    });

    const xfyunCard = await screen.findByRole('region', { name: '讯飞语音转写' });
    fireEvent.change(within(xfyunCard).getByLabelText('APPID'), { target: { value: ' xfyun-new ' } });
    fireEvent.change(within(xfyunCard).getByLabelText('APIKey'), { target: { value: ' new-key ' } });
    fireEvent.click(within(xfyunCard).getByRole('button', { name: '保存讯飞配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertXfyunConfig).toHaveBeenCalledWith({
        appId: 'xfyun-new',
        apiKey: 'new-key',
        enabled: true,
      });
    });

    const tiandituCard = await screen.findByRole('region', { name: '天地图底图' });
    fireEvent.change(within(tiandituCard).getByLabelText('浏览器端 key'), { target: { value: ' tk-new ' } });
    fireEvent.click(within(tiandituCard).getByLabelText('启用天地图底图'));
    fireEvent.click(within(tiandituCard).getByRole('button', { name: '保存天地图配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertTiandituConfig).toHaveBeenCalledWith({ key: 'tk-new', enabled: true });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/IntegrationSettings.fluent-ui.spec.tsx
```

Expected: FAIL because `IntegrationSettings.tsx` still contains old `slate-*`, `emerald-*`, `rose-*`, `rounded-2xl`, and `rounded-lg` tokens and does not expose region labels/button names required by the spec.

### Task 2: Refactor IntegrationSettings to Fluent UI

**Files:**
- Modify: `packages/web/src/components/IntegrationSettings.tsx`
- Test: `packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx`

**Interfaces:**
- Consumes: existing integration API client and `useApi` hook.
- Produces: a Fluent integration settings workspace preserving credential-safe save behavior.

- [ ] **Step 1: Replace imports and shared helpers**

In `IntegrationSettings.tsx`, import Fluent/state helpers:

```tsx
import { CheckCircle2, KeyRound, Map, MessageCircle, Mic, Plug, RefreshCw, Save, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useState, useEffect, type FormEvent } from 'react';
import { fluentButton, fluentFocus, fluentInput, fluentStatusTag } from '../ui/fluent';
import { ErrorState, LoadingState } from '../ui/state';
```

Define these helpers:

```tsx
const cardClass = 'border border-[#E1DFDD] bg-white';
const cardHeaderClass = 'flex flex-col gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4';
const labelCls = 'mb-1.5 block text-sm font-semibold text-[#323130]';
const helpCls = 'mt-1 text-xs leading-5 text-[#605E5C]';
const checkboxCls = `h-4 w-4 rounded-[4px] border-[#C8C6C4] text-[#0078D4] accent-[#0078D4] ${fluentFocus}`;
```

- [ ] **Step 2: Add reusable status and feedback helpers**

Add these functions below the class constants:

```tsx
function statusTone(enabled: boolean) {
  return enabled ? fluentStatusTag('active') : fluentStatusTag('neutral');
}

function InlineError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-sm text-[#A4262C]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SavedTag({ message }: { message: string }) {
  return (
    <span className={`${fluentStatusTag('success')} gap-1.5`}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {message}
    </span>
  );
}
```

- [ ] **Step 3: Refactor WeChat card**

Update `WechatCard` so it:
- keeps `useApi(fetchWechat)`, state hydration, and `WechatConfigInput` construction unchanged;
- renders `<section role="region" aria-label="微信小程序登录" className={cardClass}>`;
- uses `LoadingState` and `ErrorState`;
- labels `AppID`, `AppSecret`, and `启用微信登录`;
- uses a submit button with accessible name `保存微信配置`;
- only includes `dto.secret` when `secret.trim()` is non-empty.

The save handler must keep this shape:

```tsx
const onSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setSubmitting(true);
  setErr(null);
  setMsg(null);
  const dto: WechatConfigInput = { appId: appId.trim(), enabled };
  if (secret.trim()) dto.secret = secret.trim();
  try {
    await upsertWechatConfig(dto);
    setMsg('已保存');
    await reload();
  } catch (e2) {
    setErr(e2 instanceof Error ? e2.message : '保存失败');
  } finally {
    setSubmitting(false);
  }
};
```

- [ ] **Step 4: Refactor Xfyun card**

Update `XfyunCard` so it:
- keeps `useApi(fetchXfyun)`, state hydration, and `XfyunConfigInput` construction unchanged;
- renders `<section role="region" aria-label="讯飞语音转写" className={cardClass}>`;
- uses `LoadingState` and `ErrorState`;
- labels `APPID`, `APIKey`, `APISecret`, and `启用讯飞语音转写`;
- uses a submit button with accessible name `保存讯飞配置`;
- only includes `dto.apiKey` and `dto.apiSecret` when the corresponding trimmed field is non-empty.

The save handler must keep this shape:

```tsx
const onSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setSubmitting(true);
  setErr(null);
  setMsg(null);
  const dto: XfyunConfigInput = { appId: appId.trim(), enabled };
  if (apiKey.trim()) dto.apiKey = apiKey.trim();
  if (apiSecret.trim()) dto.apiSecret = apiSecret.trim();
  try {
    await upsertXfyunConfig(dto);
    setMsg('已保存');
    await reload();
  } catch (e2) {
    setErr(e2 instanceof Error ? e2.message : '保存失败');
  } finally {
    setSubmitting(false);
  }
};
```

- [ ] **Step 5: Refactor Tianditu card**

Update `TiandituCard` so it:
- keeps `useApi(fetchTianditu)` and `TiandituConfigInput` construction unchanged;
- renders `<section role="region" aria-label="天地图底图" className={cardClass}>`;
- uses `LoadingState` and `ErrorState`;
- labels `浏览器端 key` and `启用天地图底图`;
- uses a submit button with accessible name `保存天地图配置`;
- preserves the current explicit trust copy that the browser key is public and must be protected by Tianditu domain allowlist.

The save handler must keep this shape:

```tsx
const onSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setSubmitting(true);
  setErr(null);
  setMsg(null);
  const dto: TiandituConfigInput = { key: key.trim(), enabled };
  try {
    await upsertTiandituConfig(dto);
    setMsg('已保存');
    await reload();
  } catch (e2) {
    setErr(e2 instanceof Error ? e2.message : '保存失败');
  } finally {
    setSubmitting(false);
  }
};
```

- [ ] **Step 6: Refactor page shell**

Update the default export to use a compact Fluent page shell:

```tsx
export default function IntegrationSettings() {
  return (
    <div className="flex h-full max-w-4xl flex-col overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-col gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
        <div className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
          <Plug className="h-5 w-5 text-[#0078D4]" />
          第三方集成配置
        </div>
        <p className="max-w-3xl text-sm leading-6 text-[#605E5C]">
          管理微信登录、讯飞语音转写与天地图底图凭据。敏感密钥仅在保存时提交，已配置的密钥只显示脱敏状态。
        </p>
      </div>
      <div className="fluent-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F5F5F5] p-5">
        <WechatCard />
        <XfyunCard />
        <TiandituCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run focused green test**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/IntegrationSettings.fluent-ui.spec.tsx
```

Expected: PASS.

### Task 3: Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/IntegrationSettings.tsx`
- Verify: `packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-integration-settings-fluent-ui.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2.
- Produces: a reviewed and committed P1 slice.

- [ ] **Step 1: Run broad web verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform local review**

Review:

```bash
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/IntegrationSettings.tsx
Get-Content -Raw packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx
Get-Content -Raw docs/superpowers/plans/2026-07-09-p1-integration-settings-fluent-ui.md
```

Checklist:
- `IntegrationSettings.tsx` no longer contains old visual tokens listed in Global Constraints.
- Existing API behavior is preserved: load, hydrate, save, reload, error display, success display.
- Empty masked credential fields are not sent in save payloads.
- No backend/API/schema/navigation changes are present.
- The component remains bounded and does not add dependencies.

- [ ] **Step 3: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-integration-settings-fluent-ui.md packages/web/src/components/IntegrationSettings.tsx packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align integration settings with Fluent UI"
```

Expected: commit succeeds with only the plan, test, and `IntegrationSettings.tsx` changes.

## Self-Review

- Spec coverage: The plan covers the requested P-first workflow, uses Superpowers planning, requires TDD, preserves integration configuration behavior, performs verification, reviews the diff, and commits.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or incomplete generic testing instructions remain.
- Type consistency: Test mocks use the same `IntegrationProvider`, `IntegrationConfigView`, `WechatConfigInput`, `XfyunConfigInput`, and `TiandituConfigInput` shapes consumed by the component and API client.
