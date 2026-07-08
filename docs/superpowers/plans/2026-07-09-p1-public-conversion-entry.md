# P1 Public Conversion Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unauthenticated "login-only" first impression with a public SaaS conversion entry that explains value, shows pricing direction, and routes qualified users into the existing login flow.

**Architecture:** Add a Web-only `PublicLanding` component for unauthenticated users. Keep `AppLogin` as the existing authentication form, but let `App` switch between landing and login without changing auth APIs or protected app shell behavior.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, lucide-react, existing Fluent helper classes in `packages/web/src/ui/fluent.ts`.

## Global Constraints

- Do not change backend auth APIs or token handling.
- Public trace hash routes (`#/trace/:code`) must continue to render before authentication checks.
- Do not invent unsupported claims such as live blockchain, guaranteed AI accuracy, or fake customer metrics.
- Landing copy must clearly distinguish real product capabilities from setup-dependent integrations.
- Follow TDD: every production code change must be preceded by a failing test.
- Keep the Microsoft Fluent-inspired style already used by the SaaS console; use real UI blocks rather than decorative marketing clutter.

---

### Task 1: Public Landing Component

**Files:**
- Create: `packages/web/src/components/PublicLanding.tsx`
- Create: `packages/web/src/components/PublicLanding.spec.tsx`

**Interfaces:**
- Consumes: `fluentButton`, `fluentStatusTag` from `packages/web/src/ui/fluent.ts`
- Produces: default React component `PublicLanding({ onLogin }: { onLogin: () => void })`

- [ ] **Step 1: Write the failing component tests**

Create `packages/web/src/components/PublicLanding.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublicLanding from './PublicLanding';

describe('PublicLanding', () => {
  it('explains the SaaS value before login and exposes pricing direction', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '农业溯源 SaaS 平台' })).toBeTruthy();
    expect(screen.getByText('把租户、代理商、商户、批次、农事记录和公开溯源查询放进一个可审计的控制台。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '按角色开通' })).toBeTruthy();
    expect(screen.getByText('适合平台运营、代理商管理和商户生产协作，额度和支付能力按租户配置启用。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '进入控制台' })).toBeTruthy();
  });

  it('routes qualified users into the existing login flow', () => {
    const onLogin = vi.fn();
    render(<PublicLanding onLogin={onLogin} />);

    fireEvent.click(screen.getByRole('button', { name: '进入控制台' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('keeps capability copy truthful for setup-dependent integrations', () => {
    render(<PublicLanding onLogin={vi.fn()} />);

    expect(screen.getByText('AI、支付、地图、OSS 等集成在租户配置完成后启用。')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/区块链|实时全网|自动保证|永久免费/);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/PublicLanding.spec.tsx
```

Expected: FAIL because `./PublicLanding` does not exist.

- [ ] **Step 3: Implement PublicLanding**

Create `packages/web/src/components/PublicLanding.tsx` with:

```tsx
import { ArrowRight, CheckCircle2, FileText, Layers, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { fluentButton, fluentStatusTag } from '../ui/fluent';

interface PublicLandingProps {
  onLogin: () => void;
}

const capabilities = [
  { title: '多角色 SaaS 组织', desc: '平台、租户、代理商、商户和会员使用同一套权限边界。', icon: Users },
  { title: '生产与批次留档', desc: '地块、批次、农事、物流和资质文件形成可回溯记录。', icon: Layers },
  { title: '公开溯源查询', desc: '消费者可通过溯源码查看公开批次旅程与凭证。', icon: ShieldCheck },
];

export default function PublicLanding({ onLogin }: PublicLandingProps) {
  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#242424]">
      <header className="border-b border-[#E1DFDD] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-[4px] bg-[#0078D4] text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">农场溯源管理</span>
          </div>
          <button type="button" onClick={onLogin} className={fluentButton('primary')}>
            进入控制台
          </button>
        </div>
      </header>

      <main>
        <section className="border-b border-[#E1DFDD] bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[#242424] sm:text-5xl">农业溯源 SaaS 平台</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#605E5C]">
                把租户、代理商、商户、批次、农事记录和公开溯源查询放进一个可审计的控制台。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={onLogin} className={fluentButton('primary')}>
                  进入控制台
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a href="#pricing" className={fluentButton('secondary')}>查看开通方式</a>
              </div>
            </div>

            <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#242424]">产品工作流</span>
                <span className={fluentStatusTag('active')}>SaaS 控制台</span>
              </div>
              <div className="space-y-3">
                {['租户开通', '商户建档', '批次与农事留档', '公开溯源查询'].map((item) => (
                  <div key={item} className="flex items-center gap-3 border border-[#E1DFDD] bg-white px-3 py-3 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-[#107C10]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3">
          {capabilities.map(({ title, desc, icon: Icon }) => (
            <article key={title} className="border border-[#E1DFDD] bg-white p-5">
              <Icon className="h-5 w-5 text-[#0078D4]" />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#605E5C]">{desc}</p>
            </article>
          ))}
        </section>

        <section id="pricing" className="border-y border-[#E1DFDD] bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-2xl font-semibold">按角色开通</h2>
              <p className="mt-3 text-sm leading-6 text-[#605E5C]">
                适合平台运营、代理商管理和商户生产协作，额度和支付能力按租户配置启用。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
                <FileText className="h-5 w-5 text-[#0078D4]" />
                <h3 className="mt-3 text-base font-semibold">基础溯源</h3>
                <p className="mt-2 text-sm leading-6 text-[#605E5C]">批次、农事记录、公开查询和资质文件管理。</p>
              </div>
              <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-5">
                <Sparkles className="h-5 w-5 text-[#0078D4]" />
                <h3 className="mt-3 text-base font-semibold">扩展集成</h3>
                <p className="mt-2 text-sm leading-6 text-[#605E5C]">AI、支付、地图、OSS 等集成在租户配置完成后启用。</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/PublicLanding.spec.tsx
```

Expected: PASS.

---

### Task 2: Wire Landing Before Login Without Breaking Auth

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `packages/web/src/components/AppLogin.tsx`
- Modify: `packages/web/src/components/AppLogin.spec.tsx`

**Interfaces:**
- Consumes: `PublicLanding({ onLogin })` from Task 1
- Produces: unauthenticated App flow: landing first, login after CTA; `AppLogin` optional `onBackToLanding?: () => void`

- [ ] **Step 1: Write failing App and login tests**

Update `packages/web/src/App.spec.tsx` mocks:

```tsx
vi.mock('./components/PublicLanding', () => ({ default: ({ onLogin }: { onLogin: () => void }) => <button type="button" onClick={onLogin}>Landing CTA</button> }));
vi.mock('./components/AppLogin', () => ({ default: () => <div>Login Form View</div> }));
```

Add test:

```tsx
  it('shows public landing before the login form for unauthenticated visitors', async () => {
    authMock.isAuthenticated = false;

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Landing CTA' })).toBeTruthy();
    expect(screen.queryByText('Login Form View')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Landing CTA' }));

    expect(await screen.findByText('Login Form View')).toBeTruthy();
  });
```

Adjust auth mock to include mutable `isAuthenticated` and reset it in `beforeEach`.

Update `packages/web/src/components/AppLogin.spec.tsx`:

```tsx
it('offers a return path to the public landing when provided', () => {
  const onBackToLanding = vi.fn();
  render(<AppLogin onBackToLanding={onBackToLanding} />);

  fireEvent.click(screen.getByRole('button', { name: '返回介绍页' }));

  expect(onBackToLanding).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/App.spec.tsx src/components/AppLogin.spec.tsx
```

Expected: FAIL because `App` still returns `AppLogin` immediately for unauthenticated users and `AppLogin` has no back prop.

- [ ] **Step 3: Implement App unauthenticated switching**

Update `packages/web/src/App.tsx`:

```tsx
const PublicLanding = lazy(() => import('./components/PublicLanding'));
...
const [authView, setAuthView] = useState<'landing' | 'login'>('landing');
...
if (!isAuthenticated) {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      {authView === 'login'
        ? <AppLogin onBackToLanding={() => setAuthView('landing')} />
        : <PublicLanding onLogin={() => setAuthView('login')} />}
    </Suspense>
  );
}
```

Update `handleLogout` to reset `authView` to `'landing'`.

Update `packages/web/src/components/AppLogin.tsx`:

```tsx
interface AppLoginProps {
  onBackToLanding?: () => void;
}

export default function AppLogin({ onBackToLanding }: AppLoginProps) {
  ...
  {onBackToLanding && (
    <button type="button" onClick={onBackToLanding} className={`${fluentButton('secondary')} mb-4`}>
      返回介绍页
    </button>
  )}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/PublicLanding.spec.tsx src/App.spec.tsx src/components/AppLogin.spec.tsx
```

Expected: PASS.

---

### Task 3: Verification, Review, Commit

**Files:**
- Verify all files changed in Tasks 1-2

**Interfaces:**
- Consumes: completed Tasks 1-2
- Produces: committed P1 public conversion slice

- [ ] **Step 1: Run Web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 2: Run full Web tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
```

Expected: PASS.

- [ ] **Step 3: Check whitespace and diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang diff -- docs/superpowers/plans/2026-07-09-p1-public-conversion-entry.md packages/web/src/components/PublicLanding.tsx packages/web/src/components/PublicLanding.spec.tsx packages/web/src/components/AppLogin.tsx packages/web/src/components/AppLogin.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx
```

Expected: `diff --check` exits 0; diff only contains this public conversion entry.

- [ ] **Step 4: Stage and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-public-conversion-entry.md packages/web/src/components/PublicLanding.tsx packages/web/src/components/PublicLanding.spec.tsx packages/web/src/components/AppLogin.tsx packages/web/src/components/AppLogin.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "feat(web): add public conversion landing"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan addresses the P1 gap where unauthenticated visitors saw only a login form and no SaaS value proposition, pricing direction, or conversion CTA.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: `PublicLanding` exposes `onLogin`; `App` owns `authView`; `AppLogin` accepts optional `onBackToLanding`.
