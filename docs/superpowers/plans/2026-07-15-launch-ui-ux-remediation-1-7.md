# Launch UI/UX Remediation 1-7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan inline with test-driven-development. Subagents are prohibited for this task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven approved launch-facing configuration, mobile interaction, information architecture, legal, miniapp account, demo, branding, and legacy gaps.

**Architecture:** Add one secret-safe tenant-readiness vertical slice shared by backend and Web, then improve existing Web and Taro surfaces without changing role or route contracts. Cross-cutting interaction and branding rules live in shared UI/config helpers; demo and dead legacy code are isolated from the production graph.

**Tech Stack:** TypeScript, Zod, NestJS, Prisma, React 19, Vite, Tailwind CSS, Taro 4, Vitest, React Testing Library, Playwright.

## Global Constraints

- Preserve all existing role, tenant, owner, and permission boundaries.
- Readiness output must contain no credentials or configuration values.
- Keep Fluent desktop density; interactive controls must be at least 44 CSS pixels on mobile/coarse pointers.
- Preserve the emerald miniapp design and native Taro button semantics.
- Preserve the existing default JSON export URL and account-closure behavior.
- Use `corepack pnpm@10.33.2` for every command.
- Use RED -> GREEN -> refactor for every behavior change.
- Do not use subagents.

---

### Task 1: Add Production Configuration Validation and Tenant Readiness

**Files:**
- Create: `packages/shared/src/dto/readiness.dto.ts`
- Create: `packages/shared/src/dto/readiness.dto.spec.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/backend/src/modules/readiness/tenant-readiness.model.ts`
- Create: `packages/backend/src/modules/readiness/tenant-readiness.model.spec.ts`
- Create: `packages/backend/src/modules/readiness/tenant-readiness.service.ts`
- Create: `packages/backend/src/modules/readiness/tenant-readiness.service.spec.ts`
- Create: `packages/backend/src/modules/readiness/tenant-readiness.controller.ts`
- Create: `packages/backend/src/modules/readiness/tenant-readiness.controller.spec.ts`
- Create: `packages/backend/src/modules/readiness/readiness.module.ts`
- Modify: `packages/backend/src/app.module.ts`
- Modify: `packages/backend/.env.example`
- Modify: `packages/miniapp/config/production-env.ts`
- Modify: `packages/miniapp/config/production-env.spec.ts`
- Create: `packages/web/src/config/production-env.ts`
- Create: `packages/web/src/config/production-env.spec.ts`
- Modify: `packages/web/vite.config.ts`
- Modify: `.env.example`
- Create: `packages/web/src/api/readiness.ts`
- Create: `packages/web/src/api/readiness.spec.ts`
- Create: `packages/web/src/components/dashboard/TenantReadinessPanel.tsx`
- Create: `packages/web/src/components/dashboard/TenantReadinessPanel.spec.tsx`
- Modify: `packages/web/src/components/Dashboard.tsx`

**Interfaces:**
- Produces: `tenantReadinessCheckSchema`, `tenantReadinessViewSchema`, `TenantReadinessCheck`, `TenantReadinessView`.
- Adds: `GET /api/readiness/tenant` for `Role.SYSTEM_ADMIN`.
- Adds: `getTenantReadiness(): Promise<TenantReadinessView>`.
- Adds: `resolveProductionWebEnv(env)` and extends `resolveProductionMiniappEnv(env)` with required support contact.

- [ ] **Step 1: Write shared and pure-model RED tests**

```ts
expect(tenantReadinessViewSchema.parse({
  ready: false,
  checks: [{ code: 'legal', label: '法律协议', ready: false, target: 'legalSettings' }],
}).ready).toBe(false);

expect(buildTenantReadiness(checks).ready).toBe(false);
expect(buildTenantReadiness(checks).checks).not.toEqual(
  expect.arrayContaining([expect.objectContaining({ value: expect.anything() })]),
);
```

- [ ] **Step 2: Run RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test -- src/dto/readiness.dto.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/readiness/tenant-readiness.model.spec.ts
```

Expected: FAIL because the readiness contract and model do not exist.

- [ ] **Step 3: Implement the typed safe contract and model**

Use stable codes `legal`, `wechat`, `oss`, `map`, `ai`, `payment`, `quota`, `apiDomain`, `supportContact`, and `salesContact`. Targets are optional `AppTab`-compatible strings; the overall result is ready only when every check is ready.

- [ ] **Step 4: Write backend service/controller RED tests**

Mock Prisma query results for all ready, one missing integration, no credit, and missing deployment values. Assert the controller passes the current actor, has system-admin role metadata, and no returned object contains `secret`, `apiKey`, `appId`, URLs, phone numbers, or email values.

- [ ] **Step 5: Implement the readiness vertical slice**

Query only booleans/counts scoped by `actor.tenantId`: current publication, enabled integration providers (`wechat`, `tianditu`, `alipay`), enabled OSS, enabled AI provider, and positive AI/code credit. Validate `PUBLIC_BASE_URL` as non-placeholder HTTPS and check non-empty `PUBLIC_SUPPORT_CONTACT`/`PUBLIC_SALES_CONTACT`. Register `ReadinessModule` in `AppModule`.

- [ ] **Step 6: Write production-config RED tests**

Add `TARO_APP_SUPPORT_CONTACT` to the invalid miniapp table and assert trimmed output. Assert `resolveProductionWebEnv({})` names `VITE_PUBLIC_SALES_CONTACT`, rejects whitespace/`undefined`, and returns a trimmed contact.

- [ ] **Step 7: Implement build-time validators and examples**

Call `resolveProductionWebEnv` from Vite config only in production mode using `loadEnv`. Document the build variables and sanitized backend readiness variables in the example env files.

- [ ] **Step 8: Write Web API/panel RED tests and implement**

Assert Zod parsing, retryable error state, not-ready count, per-check navigation buttons, and an all-ready status. Mount the panel only in the system-admin production dashboard before metrics.

- [ ] **Step 9: Verify GREEN and commit**

Run:

```powershell
corepack pnpm@10.33.2 build:shared
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/readiness
corepack pnpm@10.33.2 --filter web test -- src/config/production-env.spec.ts src/api/readiness.spec.ts src/components/dashboard/TenantReadinessPanel.spec.tsx
corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- config/production-env.spec.ts
```

Expected: PASS.

Commit: `feat(readiness): add tenant launch gate`

---

### Task 2: Redesign Mobile Merchant Cards and Batch Filters

**Files:**
- Modify: `packages/web/src/components/MerchantManagement.tsx`
- Modify: `packages/web/src/components/MerchantManagement.spec.tsx`
- Modify: `packages/web/src/components/batch-admin/BatchCommandBar.tsx`
- Create: `packages/web/src/components/batch-admin/BatchCommandBar.spec.tsx`
- Modify: `packages/web/src/components/BatchAdmin.tsx`

**Interfaces:**
- Produces: memoized `MerchantCard` using the same `onEdit`/`onToggle` actions as `MerchantRow`.
- Produces: `activeBatchFilterCount({ filterType, filterHouse, filterDateRange }): number`.

- [ ] **Step 1: Write merchant-card RED test**

Render a merchant page and assert a mobile region exposes name, phone, status, field/area summary, edit, and suspend actions without a minimum-width table dependency.

- [ ] **Step 2: Run RED and implement cards**

Run `corepack pnpm@10.33.2 --filter web test -- src/components/MerchantManagement.spec.tsx`.

Expected before implementation: FAIL. Add `md:hidden` cards and keep the table `hidden md:table`; reuse callbacks and status tags.

- [ ] **Step 3: Write batch-filter RED test**

Assert there is one crop select, one field select, one date select, search remains outside the collapsed region, the trigger says `筛选 (2)` for two active filters, and reset clears all filters.

- [ ] **Step 4: Implement one expandable filter surface**

Remove the always-visible duplicate selects. Keep search and command actions in the main bar. Render labelled filters only in the expandable region and expose `aria-expanded`/`aria-controls`.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/MerchantManagement.spec.tsx src/components/batch-admin/BatchCommandBar.spec.tsx src/components/BatchAdmin.spec.tsx
```

Expected: PASS.

Commit: `feat(web): improve mobile merchant and batch controls`

---

### Task 3: Enforce Global Mobile Touch Targets

**Files:**
- Modify: `packages/web/src/ui/fluent.ts`
- Modify: `packages/web/src/ui/fluent.spec.ts`
- Modify: `packages/web/src/index.css`
- Modify: `e2e/web/accessibility.spec.ts`

**Interfaces:**
- Adds CSS hooks: `fluent-control`, `fluent-icon-control`, and `fluent-input-control`.
- Coarse-pointer/mobile minimum: 44 by 44 CSS pixels for interactive controls.

- [ ] **Step 1: Write style-contract RED tests**

Assert all Fluent button variants include `fluent-control`, icon includes `fluent-icon-control`, input/select include `fluent-input-control`, and `index.css` contains coarse-pointer/mobile 44-pixel minimum rules.

- [ ] **Step 2: Run RED**

Run `corepack pnpm@10.33.2 --filter web test -- src/ui/fluent.spec.ts`.

Expected: FAIL on missing hooks/rules.

- [ ] **Step 3: Implement centralized responsive sizing**

Keep current `h-8` desktop classes. Add minimum height/width in `@media (pointer: coarse), (max-width: 767px)` and explicitly cover mobile shell navigation buttons.

- [ ] **Step 4: Add rendered measurement assertion**

At 390 pixels, measure representative shell, filter, pagination, and dialog controls and assert each actionable target is at least 44 pixels in one dimension appropriate to the control.

- [ ] **Step 5: Verify GREEN and commit**

Run `corepack pnpm@10.33.2 --filter web test -- src/ui/fluent.spec.ts`.

Expected: PASS.

Commit: `fix(web): enforce mobile touch targets`

---

### Task 4: Simplify Admin Information Architecture and Page Headings

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `packages/web/src/AppShell.model.ts`

**Interfaces:**
- Keeps every existing `AppTab` and hash segment unchanged.
- System-admin categories become `生产管理`, `组织管理`, `智能与计费`, and `配置与合规`.

- [ ] **Step 1: Write navigation RED test**

Assert exact category names/order and exact tab membership. Assert all pre-existing system-admin tab IDs remain present once.

- [ ] **Step 2: Write shell-heading RED test**

Render a routed workspace and assert the shell exposes a breadcrumb but no duplicate outer page `<h2>` or role subtitle; assert `document.title` contains the active item and `农场溯源管理`.

- [ ] **Step 3: Run RED and implement**

Run `corepack pnpm@10.33.2 --filter web test -- src/navigation.spec.ts src/App.spec.tsx`.

Expected before implementation: FAIL. Reorganize category arrays and replace the outer title block with a compact breadcrumb row plus a document-title effect.

- [ ] **Step 4: Verify GREEN and commit**

Run the same command; expected PASS.

Commit: `refactor(web): simplify admin navigation hierarchy`

---

### Task 5: Add Legal Draft Preview and Sticky Actions

**Files:**
- Modify: `packages/web/src/components/LegalSettings.tsx`
- Modify: `packages/web/src/components/LegalSettings.spec.tsx`
- Create: `packages/web/src/components/legal/LegalDraftPreview.tsx`
- Create: `packages/web/src/components/legal/LegalDraftPreview.spec.tsx`

**Interfaces:**
- Produces: `<LegalDraftPreview draft currentPublication />` with escaped plain text only.
- Keeps existing save and publish APIs unchanged.

- [ ] **Step 1: Write preview RED tests**

Assert operator/version/effective-date metadata, both document bodies, published-vs-draft status, and literal rendering of `<script>` without DOM insertion.

- [ ] **Step 2: Write workflow RED test**

Assert `预览草稿` toggles editor/preview, sticky actions contain both `保存草稿` and `发布当前草稿`, dirty state disables publish, save re-enables publish, and confirm still precedes publish.

- [ ] **Step 3: Run RED and implement**

Run `corepack pnpm@10.33.2 --filter web test -- src/components/legal/LegalDraftPreview.spec.tsx src/components/LegalSettings.spec.tsx`.

Expected before implementation: FAIL. Extract the preview, move actions into a sticky footer, and retain schema validation/error summaries.

- [ ] **Step 4: Verify GREEN and commit**

Run the same command; expected PASS.

Commit: `feat(web): improve legal publishing workflow`

---

### Task 6: Improve Miniapp Me and Account Data Export

**Files:**
- Create: `packages/miniapp/src/pages/profile-edit/index.tsx`
- Create: `packages/miniapp/src/pages/profile-edit/index.scss`
- Create: `packages/miniapp/src/pages/profile-edit/index.config.ts`
- Create: `packages/miniapp/src/pages/password-change/index.tsx`
- Create: `packages/miniapp/src/pages/password-change/index.scss`
- Create: `packages/miniapp/src/pages/password-change/index.config.ts`
- Modify: `packages/miniapp/src/app.config.ts`
- Modify: `packages/miniapp/src/pages/me/index.tsx`
- Modify: `packages/miniapp/src/pages/me/index.scss`
- Modify: `packages/miniapp/src/pages/me/truthfulness.spec.ts`
- Create: `packages/miniapp/src/pages/account-data/presentation.ts`
- Create: `packages/miniapp/src/pages/account-data/presentation.spec.ts`
- Modify: `packages/miniapp/src/pages/account-data/index.tsx`
- Modify: `packages/miniapp/src/pages/account-data/index.scss`
- Modify: `packages/miniapp/src/api/account.ts`
- Modify: `packages/miniapp/src/api/account.spec.ts`
- Modify: `packages/miniapp/test/e2e/critical-flows.spec.tsx`
- Modify: `packages/backend/src/modules/account-lifecycle/account-lifecycle.controller.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-lifecycle.controller.spec.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-data.service.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-data.service.spec.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-data.model.ts`
- Modify: `packages/backend/src/modules/account-lifecycle/account-data.model.spec.ts`

**Interfaces:**
- Adds export query `format?: 'json' | 'csv'`; missing format remains JSON.
- Changes miniapp helpers to `exportMyData(format)` and `shareMyData(filePath, format)`.
- Produces: `formatAccountDate`, `accountRecordLabel`, and CSV escaping/flattening helpers.

- [ ] **Step 1: Write miniapp navigation RED test**

Assert Me buttons navigate immediately to `/pages/profile-edit/index` and `/pages/password-change/index`, and the old appended panels are absent.

- [ ] **Step 2: Implement dedicated profile/password pages**

Move the existing form state, validation, loading, API calls, and success/error feedback into dedicated pages. Register both before tab pages in `app.config.ts`.

- [ ] **Step 3: Write presentation RED tests**

```ts
expect(formatAccountDate('2026-07-14T09:00:00.000Z')).toMatch(/2026/);
expect(accountRecordLabel({ id: 'opaque' }, '上传记录')).toBe('未命名上传记录');
expect(accountRecordLabel({ batchNo: 'B-1', id: 'opaque' }, '批次')).toBe('B-1');
```

- [ ] **Step 4: Write backend CSV RED tests**

Assert default JSON compatibility, `format=csv` content type/filename, UTF-8 BOM, quoted commas/newlines, human column headers, and existing limit rejection.

- [ ] **Step 5: Implement format-aware export**

Reuse one scoped data load. JSON keeps the existing schema. CSV flattens identity and category records with `类别,名称,状态,发生时间,详情`; it never invents labels or expands access scope.

- [ ] **Step 6: Write miniapp API/page RED tests and implement**

Assert format query, extension-specific save/share names, export controls near the identity summary, Chinese dates, and no rendered opaque IDs. Offer `导出 JSON` and `导出 CSV`; preserve retry/share states.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/account-lifecycle
corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/api/account.spec.ts src/pages/account-data/presentation.spec.ts src/pages/me/truthfulness.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/miniapp test:e2e
```

Expected: PASS.

Commit: `feat(miniapp): improve account settings and data export`

---

### Task 7: Isolate Demo, Unify Branding, Remove Legacy, and Clean Anonymous Bootstrap

**Files:**
- Create: `packages/web/src/ui/branding.ts`
- Create: `packages/web/src/ui/branding.spec.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/AppLogin.tsx`
- Modify: `packages/web/src/components/PublicLanding.tsx`
- Modify: `packages/web/src/components/Dashboard.tsx`
- Modify: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`
- Modify: `packages/web/src/config/manual-chunks.spec.ts`
- Modify: `packages/web/src/api/request.ts`
- Modify: `packages/web/src/api/request.spec.ts`
- Modify: `packages/web/src/auth/auth-context.tsx`
- Modify: `packages/web/src/auth/auth-context.spec.tsx`
- Modify: `packages/backend/src/auth/auth.controller.ts`
- Modify: `packages/backend/src/auth/auth.controller.spec.ts`
- Modify: `packages/miniapp/src/app.config.ts`
- Modify: `packages/miniapp/src/styles/theme.scss`
- Create: `packages/miniapp/src/constants/branding.ts`
- Create: `packages/miniapp/src/constants/branding.spec.ts`
- Delete: `packages/web/src/components/SystemAdmin.tsx`
- Delete: `packages/web/src/components/SystemAdmin.fluent-ui.spec.tsx`
- Delete: `packages/web/src/components/SystemAdmin.truthfulness.spec.tsx`
- Delete: `packages/web/src/components/SystemAdmin.unavailable-boundary.spec.tsx`
- Delete: `packages/web/src/components/AgentPlatform.tsx`
- Delete: `packages/web/src/components/legacy/MobileView.tsx`
- Delete: `packages/web/src/components/legacy/README.md`
- Delete: `packages/web/src/components/legacy-boundary.spec.ts`
- Modify: `packages/web/src/navigation.spec.ts`

**Interfaces:**
- Adds `PRODUCT_NAME = '农场溯源管理'` on Web and miniapp.
- Adds `discoverWebSession(): Promise<string | null>` using `POST /api/auth/web/session`.
- Keeps `POST /api/auth/web/refresh` unchanged for authenticated request recovery.

- [ ] **Step 1: Write demo-isolation RED tests**

Assert no demo button when the flag is false/absent, the button and badge exist when true, and the production build output contains no `DashboardDemo` or demo vendor chunk.

- [ ] **Step 2: Implement compile-time demo gating**

Gate the lazy dynamic import and entry with `import.meta.env.VITE_ENABLE_DEMO_DASHBOARD === 'true'`. Keep demo copy visibly marked when enabled.

- [ ] **Step 3: Write branding RED tests and implement constants**

Assert production Web surfaces and miniapp navigation use `农场溯源管理`, and `芍药工作台` is absent from production source outside historical docs.

- [ ] **Step 4: Write anonymous-session RED tests**

Backend: no cookie returns 204 without calling refresh; valid cookie returns access token and rotates the cookie. Web: 204 resolves null without auth-expired callback, while server/network failure remains distinguishable and request-time 401 recovery still uses `/web/refresh`.

- [ ] **Step 5: Implement session discovery**

Add `POST /auth/web/session` as a public throttled endpoint. Switch `AuthProvider` bootstrap to `discoverWebSession`; retain `refreshWebSession` for normal API retry.

- [ ] **Step 6: Prove and delete dead legacy surfaces**

Run `rg -n "SystemAdmin|AgentPlatform|MobileView" packages/web/src --glob '!**/*.spec.*'`. Expected: only the files being deleted. Delete their file-local tests and strengthen `navigation.spec.ts` to assert the files no longer exist.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/auth/auth.controller.spec.ts
corepack pnpm@10.33.2 --filter web test -- src/api/request.spec.ts src/auth/auth-context.spec.tsx src/components/Dashboard.truthfulness.spec.tsx src/navigation.spec.ts src/ui/branding.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/miniapp test -- src/constants/branding.spec.ts
$env:VITE_PUBLIC_SALES_CONTACT='sales@example.com'; corepack pnpm@10.33.2 --filter web build
```

Expected: PASS and no demo chunks in `packages/web/dist/assets` when the demo flag is absent.

Commit: `chore(ui): isolate demo and remove legacy surfaces`

---

### Task 8: Rendered QA, Full Verification, Self-review, and Final Commit

**Files:**
- Modify only files required by review findings.
- Do not commit screenshots, traces, reports, or temporary scripts.

**Interfaces:** None.

- [ ] **Step 1: Run focused responsive Playwright QA**

The in-app Browser previously failed on localhost with `ERR_BLOCKED_BY_CLIENT`, so use the repository Playwright workflow. Validate desktop and 390-pixel mobile page identity, meaningful DOM, no framework overlay, console health, screenshot evidence, and interactions for merchant cards, batch filters, navigation, legal preview/save/publish enablement, demo absence, and anonymous landing.

- [ ] **Step 2: Run rendered miniapp QA**

Exercise Me -> profile edit, Me -> password change, account-data JSON/CSV selection, error retry, and share state using the repository jsdom/Taro harness.

- [ ] **Step 3: Run fresh full verification**

```powershell
$env:TARO_APP_API='https://api.example.com/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
$env:TARO_APP_SUPPORT_CONTACT='support@example.com'
$env:VITE_PUBLIC_SALES_CONTACT='sales@example.com'
corepack pnpm@10.33.2 verify:local
```

Expected: shared, backend, Web, miniapp unit/rendered, lint, typecheck, builds, and audit all PASS.

- [ ] **Step 4: Perform self-review without subagents**

Review `git diff` against the design requirement by requirement. Check React best practices: no request waterfalls introduced, no unnecessary eager demo import, stable keys/callbacks for lists, no derived-state effects where pure computation works, and no secrets/config values rendered. Run `git diff --check` and scan for unfinished markers, `芍药工作台`, raw internal-ID fallbacks, duplicate batch filters, and deleted legacy imports.

- [ ] **Step 5: Fix every critical/important review finding with RED/GREEN proof**

Add or update a focused regression test before each fix, rerun the affected suite, then rerun the full verification command.

- [ ] **Step 6: Commit review fixes if any**

Commit: `fix: address launch UI UX review findings`

- [ ] **Step 7: Record final evidence**

Report commit SHAs, exact test counts, build/audit status, Playwright viewport evidence, Browser fallback reason, and any genuinely untested production-only external integration.

---

## Final Review Checklist

- [ ] All ten readiness checks are typed, tenant-scoped, and secret-safe.
- [ ] Production miniapp support and Web sales contacts fail closed at build time.
- [ ] Merchant mobile actions do not require horizontal table scrolling.
- [ ] Batch filters render once and show an active count.
- [ ] Mobile/coarse-pointer interactive targets meet 44 pixels.
- [ ] System-admin tab IDs are unchanged and grouped into four categories.
- [ ] The shell does not duplicate workspace headings.
- [ ] Legal preview is plain text and sticky save/publish state remains truthful.
- [ ] Miniapp profile/password actions open dedicated pages.
- [ ] Account-data dates and labels are human-readable and JSON remains compatible.
- [ ] CSV export is scoped, escaped, bounded, and format-labelled.
- [ ] Demo chunks are absent from the normal production build.
- [ ] Generic branding is consistent across Web and miniapp.
- [ ] Dead SystemAdmin, AgentPlatform, and legacy MobileView files are absent.
- [ ] Anonymous Web bootstrap produces 204 rather than expected 401 noise.
- [ ] `verify:local`, responsive Playwright, rendered miniapp tests, and `git diff --check` pass before completion is claimed.
