# P1 Public Conversion Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a truthful assisted-opening conversion path to the public SaaS landing page.

**Architecture:** Keep `PublicLanding` as a static, UI-only React component. Read `import.meta.env.VITE_PUBLIC_SALES_CONTACT` through a tiny helper, and keep that helper pure-testable by accepting an optional env object. The component also accepts an optional `salesContact` prop for deterministic UI tests. Do not add backend lead capture or client-only forms.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS utility classes, lucide-react icons.

## Global Constraints

- Use approved direction A:真实开通路径 + 可配置联系方式。
- Do not add self-serve signup, fake trial, fake prices, fake case studies, or automatic tenant creation.
- Do not change backend APIs, auth flows, billing flows, or role permissions.
- Contact configuration key is exactly `VITE_PUBLIC_SALES_CONTACT`.
- Existing `进入控制台` login behavior must remain unchanged.
- Use TDD: write failing tests before production code changes.

---

## File Structure

- Modify: `packages/web/src/components/PublicLanding.spec.tsx`
  - Adds tests for assisted opening copy, env contact, fallback contact, and forbidden fake conversion copy.
- Modify: `packages/web/src/components/PublicLanding.tsx`
  - Adds `resolveSalesContact()`, `openingMaterials`, and a new `#opening` section.
- Modify: `.env.example`
  - Documents `VITE_PUBLIC_SALES_CONTACT`.
- Create: `docs/superpowers/specs/2026-07-09-public-conversion-entry-design.md`
  - Captures approved design direction.
- Create: `docs/superpowers/plans/2026-07-09-p1-public-conversion-entry.md`
  - This execution plan.

## Task 1: Landing Tests

**Files:**
- Modify: `packages/web/src/components/PublicLanding.spec.tsx`

**Interfaces:**
- Consumes: `PublicLanding` default export and `resolveSalesContact`.
- Produces: Tests for the public conversion opening section, deterministic contact rendering, and safe env parsing.

- [ ] **Step 1: Write the failing tests**

Add these tests to `packages/web/src/components/PublicLanding.spec.tsx`:

```tsx
  it('separates existing-account login from assisted opening', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByRole('button', { name: '进入控制台' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '申请开通' }).getAttribute('href')).toBe('#opening');
    expect(screen.getByRole('heading', { name: '申请开通前准备' })).toBeTruthy();
    expect(screen.getByText('租户由平台运营人员审核资料后创建，开通前需要人工审核与配置。')).toBeTruthy();
  });

  it('shows required opening materials for operator review', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    for (const text of ['机构编码与主体名称', '管理员姓名与联系方式', '角色范围与商户/代理商关系', '计费、AI、地图或 OSS 集成需求']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('renders configured sales contact without collecting lead data locally', () => {
    render(<PublicLanding onLogin={vi.fn()} salesContact="sales@example.com / 400-000-0000" />);
    expect(screen.getByText('sales@example.com / 400-000-0000')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows a safe operator-contact fallback when sales contact is not configured', () => {
    render(<PublicLanding onLogin={vi.fn()} salesContact={null} />);
    expect(screen.getByText('请联系平台运营人员获取开通方式。')).toBeTruthy();
  });

  it('resolves configured sales contact from public environment safely', () => {
    expect(resolveSalesContact({ VITE_PUBLIC_SALES_CONTACT: ' sales@example.com ' })).toBe('sales@example.com');
    expect(resolveSalesContact({ VITE_PUBLIC_SALES_CONTACT: 'undefined' })).toBeNull();
    expect(resolveSalesContact({})).toBeNull();
  });
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/PublicLanding.spec.tsx
```

Expected: FAIL because `申请开通`, `申请开通前准备`, materials, and contact behavior do not exist yet.

## Task 2: Landing Implementation

**Files:**
- Modify: `packages/web/src/components/PublicLanding.tsx`

**Interfaces:**
- Produces: `resolveSalesContact(env?: SalesContactEnv): string | null`, used by `PublicLanding` and tested directly.

- [ ] **Step 1: Update imports and constants**

Modify the import and add constants:

```tsx
import { ArrowRight, CheckCircle2, ClipboardList, FileText, Layers, Mail, ShieldCheck, Sparkles, Users } from 'lucide-react';
```

```tsx
const openingMaterials = [
  '机构编码与主体名称',
  '管理员姓名与联系方式',
  '角色范围与商户/代理商关系',
  '计费、AI、地图或 OSS 集成需求',
];

type PublicLandingImportMeta = ImportMeta & {
  env?: {
    VITE_PUBLIC_SALES_CONTACT?: string;
  };
};

type SalesContactEnv = {
  VITE_PUBLIC_SALES_CONTACT?: string | null;
};

export function resolveSalesContact(env: SalesContactEnv | undefined = (import.meta as PublicLandingImportMeta).env): string | null {
  const raw = env?.VITE_PUBLIC_SALES_CONTACT;
  const value = raw == null ? '' : String(raw).trim();
  return value && value !== 'undefined' ? value : null;
}
```

- [ ] **Step 2: Add the hero assisted-opening CTA**

Inside the hero CTA group, keep the `进入控制台` button and add:

```tsx
<a href="#opening" className={fluentButton('secondary')}>
  申请开通
</a>
```

Keep `查看开通方式` as an anchor to `#pricing`.

- [ ] **Step 3: Add the opening section**

After the capabilities section and before the pricing section, add:

```tsx
        <section id="opening" className="border-y border-[#E1DFDD] bg-[#FAFAFA]">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase text-[#605E5C]">
                <ClipboardList className="h-4 w-4 text-[#0078D4]" />
                Assisted opening
              </div>
              <h2 className="text-2xl font-semibold">申请开通前准备</h2>
              <p className="mt-3 text-sm leading-6 text-[#605E5C]">
                租户由平台运营人员审核资料后创建，开通前需要人工审核与配置。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
              <div className="border border-[#E1DFDD] bg-white p-5">
                <h3 className="text-base font-semibold text-[#242424]">开通材料</h3>
                <div className="mt-4 grid gap-3">
                  {openingMaterials.map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-[#323130]">
                      <CheckCircle2 className="h-4 w-4 text-[#107C10]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-[#E1DFDD] bg-white p-5">
                <Mail className="h-5 w-5 text-[#0078D4]" />
                <h3 className="mt-3 text-base font-semibold text-[#242424]">联系开通</h3>
                <p className="mt-2 text-sm leading-6 text-[#605E5C]">
                  {salesContact ? '请通过以下联系方式提交开通资料。' : '请联系平台运营人员获取开通方式。'}
                </p>
                {salesContact && (
                  <div className="mt-3 border border-[#C8C6C4] bg-[#F5F5F5] px-3 py-2 text-sm font-semibold text-[#323130]">
                    {salesContact}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
```

Keep production behavior as the default prop value:

```tsx
export default function PublicLanding({ onLogin, salesContact = resolveSalesContact() }: PublicLandingProps) {
```

- [ ] **Step 4: Run focused test to verify it passes**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/PublicLanding.spec.tsx
```

Expected: PASS.

## Task 3: Environment Documentation

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Produces: Documentation for `VITE_PUBLIC_SALES_CONTACT`.

- [ ] **Step 1: Add the env documentation**

Append this to `.env.example`:

```dotenv
#
# 前端公开落地页联系方式(可选):会显示在未登录首页的“申请开通”区域。
# 示例:
# VITE_PUBLIC_SALES_CONTACT="sales@example.com / 400-000-0000"
```

- [ ] **Step 2: Verify docs mention the exact env key**

Run:

```powershell
Select-String -Path .env.example -Pattern 'VITE_PUBLIC_SALES_CONTACT'
```

Expected: output includes `VITE_PUBLIC_SALES_CONTACT`.

## Task 4: Full Verification And Commit

**Files:**
- Verify all changed files.

**Interfaces:**
- Produces: One committed P1 slice.

- [ ] **Step 1: Run focused conversion test**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/PublicLanding.spec.tsx
```

Expected: PASS.

- [ ] **Step 2: Run web type check**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 3: Run full web tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```powershell
corepack pnpm@10.33.2 --filter web build
```

Expected: PASS. Existing large `DashboardDemo` warning may remain.

- [ ] **Step 5: Check diff hygiene**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang status --short
```

Expected: no whitespace errors; changed files limited to this P1.

- [ ] **Step 6: Stage exact files and inspect staged diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add .env.example docs/superpowers/specs/2026-07-09-public-conversion-entry-design.md docs/superpowers/plans/2026-07-09-p1-public-conversion-entry.md packages/web/src/components/PublicLanding.tsx packages/web/src/components/PublicLanding.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang diff --cached --stat
```

Expected: no whitespace errors; staged diff only includes the intended files.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang commit -m "feat(web): add truthful public opening path"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan implements the approved assisted-opening path, contact env, fallback, materials list, and negative truthfulness boundaries.
- Placeholder scan: No `TBD`, `TODO`, or unresolved placeholder instructions remain.
- Type consistency: The only new helper is `resolveSalesContact(): string | null`, and it is consumed inside `PublicLanding`.
