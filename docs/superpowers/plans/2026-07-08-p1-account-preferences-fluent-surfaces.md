# Account Preferences Fluent Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the account and local preference surfaces, `Settings` and `ProfileSettings`, into the Microsoft Fluent SaaS console system while preserving real profile/password API behavior and local-only preference storage.

**Architecture:** Keep all changes inside `packages/web`. Reuse local Fluent helpers from `packages/web/src/ui/fluent.ts`, shared data states from `packages/web/src/ui/state.tsx`, and the global toast from `packages/web/src/hooks/useToast.tsx`. Do not change backend DTOs, auth context contracts, route wiring, or role navigation.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utility classes, lucide-react, local Fluent utility helpers.

## Global Constraints

- Preserve existing API contracts: `getMe`, `updateMe`, `changePassword`, and `useAuth().updateProfile` keep their current signatures and behavior.
- Preserve local preference storage key: `agri_display_preferences`.
- Use Microsoft Fluent 2 inspired console styling: neutral surfaces, compact density, Microsoft blue `#0078D4`, 1px borders, radius mostly `4px` to `8px`, quiet shadows.
- Remove dominant emerald/card-heavy styling from these account/preference surfaces.
- Keep workflows truthful: `Settings` must describe only local browser preferences, and `ProfileSettings` must update only profile/password fields backed by existing APIs.
- Keep loading, error, success, validation, disabled, and close states visible and understandable.
- Use TDD: write failing component tests before production component changes and verify each red/green step.
- Because subagent tools are not exposed in this Codex session, execute inline while following the same task/review gates.

---

### Task 1: Settings Fluent Regression Coverage

**Files:**
- Modify: `packages/web/src/components/Settings.spec.tsx`
- Modify later: `packages/web/src/components/Settings.tsx`

**Interfaces:**
- Consumes: `localStorage`, `ToastBanner` from `../hooks/useToast`, Fluent helpers from `../ui/fluent`.
- Produces: Regression tests proving `Settings` uses the Fluent page surface, saves only local display preferences, and no longer emits old green/card-heavy styling.

- [ ] **Step 1: Write the failing tests**

Update `packages/web/src/components/Settings.spec.tsx` to render `Settings` with `ToastBanner` and assert:
- The page heading is `本地偏好` and the save command is `保存本地偏好`.
- Toggling `紧凑表格` and saving writes `"compactTables":true` to `agri_display_preferences`.
- The success toast text is `本地偏好已保存`.
- The root/settings sections contain Fluent border classes such as `border-[#E1DFDD]`.
- The rendered settings container does not contain old style markers: `bg-emerald`, `text-emerald`, `rounded-2xl`, `shadow-xl`, or `shadow-sm`.

- [ ] **Step 2: Run tests to verify red**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/Settings.spec.tsx`

Expected: FAIL because the current component uses emerald buttons/toast and rounded/card-heavy classes.

- [ ] **Step 3: Implement minimal Settings UI changes**

Modify `packages/web/src/components/Settings.tsx` to:
- Import `showToast` from `../hooks/useToast`.
- Import `fluentButton`, `fluentFocus`, and `fluentSelect` from `../ui/fluent`.
- Remove local motion toast state and `motion/react` usage.
- Replace old emerald buttons, rounded-xl/2xl cards, and heavy shadows with Fluent borders, neutral surfaces, blue checkbox focus, and compact section rows.
- Preserve `loadPreferences`, `DEFAULT_PREFERENCES`, and `localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))`.

- [ ] **Step 4: Run tests to verify green**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/Settings.spec.tsx`

Expected: PASS.

---

### Task 2: ProfileSettings Fluent Regression Coverage

**Files:**
- Create: `packages/web/src/components/ProfileSettings.spec.tsx`
- Modify later: `packages/web/src/components/ProfileSettings.tsx`

**Interfaces:**
- Consumes: `MeProfileView` from `@nongchang/shared`; mocked `getMe`, `updateMe`, and `changePassword` from `../api/auth`; mocked `useAuth` from `../auth/auth-context`.
- Produces: Regression tests proving the modal loads real profile data, updates profile through `updateMe`, validates password inputs before API calls, changes password through `changePassword`, and uses Fluent modal/tabs/form styling.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/components/ProfileSettings.spec.tsx` with tests for:
- Rendering `个人账号设置`, `个人资料`, `修改密码`, account/role fields, and a Fluent modal surface with `border-[#E1DFDD]`.
- Updating display name/phone and asserting `updateMe` receives trimmed values, then `useAuth().updateProfile` receives the returned profile.
- Rejecting too-short passwords, mismatched confirmation, and unchanged new password without calling `changePassword`.
- Submitting a valid password change and asserting `changePassword` receives `{ oldPassword, newPassword }` and clears password inputs after success.

- [ ] **Step 2: Run tests to verify red**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/ProfileSettings.spec.tsx`

Expected: FAIL because no profile settings spec exists and the current modal still carries old emerald/card-heavy styling.

- [ ] **Step 3: Implement minimal ProfileSettings UI changes**

Modify `packages/web/src/components/ProfileSettings.tsx` to:
- Import `fluentButton`, `fluentFocus`, and `fluentInput` from `../ui/fluent`.
- Import `LoadingState` and `ErrorState` from `../ui/state`.
- Replace old emerald tabs/buttons, rounded-2xl modal, and shadow-heavy classes with Fluent dialog, tab, form, and status styling.
- Keep the same `getMe`, `updateMe`, `changePassword`, and `updateProfile` flow.
- Preserve validation semantics: display name length at least 2, new password length at least 6, confirmation must match, and new password must differ from old password.

- [ ] **Step 4: Run tests to verify green**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/ProfileSettings.spec.tsx`

Expected: PASS.

---

### Task 3: Slice Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/Settings.tsx`
- Verify: `packages/web/src/components/ProfileSettings.tsx`
- Verify: `packages/web/src/components/Settings.spec.tsx`
- Verify: `packages/web/src/components/ProfileSettings.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-08-p1-account-preferences-fluent-surfaces.md`

**Interfaces:**
- Consumes: The changed components and tests from Tasks 1-2.
- Produces: A reviewed commit on the current branch.

- [ ] **Step 1: Run focused tests**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/Settings.spec.tsx src/components/ProfileSettings.spec.tsx`

Expected: PASS.

- [ ] **Step 2: Run Web verification**

Run: `corepack pnpm@10.33.2 --filter web lint`

Expected: exit 0.

Run: `corepack pnpm@10.33.2 --filter web test`

Expected: all Web tests pass.

Run: `corepack pnpm@10.33.2 --filter web build`

Expected: Vite build exits 0. Existing `DashboardDemo` chunk-size warning may remain because this slice does not modify it.

- [ ] **Step 3: Scan old-style residue in target files**

Run: `rg -n "bg-emerald|text-emerald|border-emerald|from-emerald|to-green|rounded-2xl|rounded-3xl|bg-gradient|shadow-sm|shadow-xl" packages/web/src/components/Settings.tsx packages/web/src/components/ProfileSettings.tsx`

Expected: no output.

- [ ] **Step 4: Review diff**

Run: `git -c safe.directory=E:/code/nongchang diff --check`

Expected: no whitespace errors.

Review checklist:
- Tests prove local preference persistence and profile/password behavior through real API wrappers.
- No backend contracts, auth context API, role navigation, or DTOs changed.
- Account/preference surfaces use local Fluent helpers and shared state/toast primitives.
- No new fake settings, capabilities, metrics, or unsupported account fields are introduced.

- [ ] **Step 5: Commit**

Run:
```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-08-p1-account-preferences-fluent-surfaces.md packages/web/src/components/Settings.tsx packages/web/src/components/ProfileSettings.tsx packages/web/src/components/Settings.spec.tsx packages/web/src/components/ProfileSettings.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "feat(web): align account preferences with Fluent"
```

Expected: commit created successfully.

## Self-Review

- Spec coverage: This plan implements the next priority slice from the SaaS UI completion audit: account/profile and local-preference pages with visible old-style residue and incomplete profile tests.
- Placeholder scan: No TBD/TODO/fill-later placeholders remain.
- Type consistency: The plan uses existing exported API/client names and shared type names visible in the current codebase.
- Scope check: This slice intentionally excludes `IntegrationSettings`, `SystemSettings`, `AiAssistant`, and the larger `BatchAdmin` cleanup; those should be separate follow-up plans after this commit.
