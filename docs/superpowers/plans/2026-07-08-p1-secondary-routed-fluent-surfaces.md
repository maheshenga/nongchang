# Secondary Routed Fluent Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the first remaining secondary routed production pages, `QuickTemplates` and `PhenologyAdmin`, into the Microsoft Fluent SaaS console system while preserving real API behavior and adding regression coverage.

**Architecture:** Keep all changes inside `packages/web`. Reuse the local Fluent helpers in `packages/web/src/ui/fluent.ts`, shared data states in `packages/web/src/ui/state.tsx`, global dialogs in `packages/web/src/hooks/useDialog.tsx`, and global toast in `packages/web/src/hooks/useToast.tsx`. Do not change backend DTOs, shared types, API client contracts, route wiring, or role navigation.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utility classes, lucide-react, local Fluent utility helpers.

## Global Constraints

- Preserve existing API contracts: `listQuickTemplates`, `createQuickTemplate`, `updateQuickTemplate`, `deleteQuickTemplate`, `listPhenologies`, `createPhenology`, and `deletePhenology` keep their current signatures and endpoints.
- Use Microsoft Fluent 2 inspired console styling: neutral surfaces, compact density, Microsoft blue `#0078D4`, 1px borders, radius mostly `4px` to `8px`, quiet shadows.
- Remove dominant emerald/card-heavy styling from these two routed admin pages.
- Keep real workflows truthful: no fake metrics, fake dashboards, fake AI insights, or invented backend capabilities.
- Keep loading, error, empty, success, destructive, and disabled states visible and understandable.
- Use TDD: write failing component tests before production component changes and verify each red/green step.
- Because subagent tools are not exposed in this Codex session, execute inline while following the same task/review gates.

---

### Task 1: QuickTemplates Fluent Regression Coverage

**Files:**
- Create: `packages/web/src/components/QuickTemplates.spec.tsx`
- Modify later: `packages/web/src/components/QuickTemplates.tsx`

**Interfaces:**
- Consumes: `QuickTemplateView` from `@nongchang/shared`; mocked API functions from `../api/quick-template`; `DialogHost` from `../hooks/useDialog`.
- Produces: Regression tests that prove the page renders a Fluent table, creates/updates through real API wrappers, and keeps delete behind `confirmDialog`.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/components/QuickTemplates.spec.tsx` with tests for:
- Rendering a template table and checking for compact Fluent surface classes on the table wrapper.
- Creating a template by filling name/action/note/cost/labor/sort and asserting `createQuickTemplate` receives the trimmed numeric DTO.
- Updating an existing template and asserting `updateQuickTemplate` receives the id and DTO.
- Cancelling delete in the confirmation dialog and asserting `deleteQuickTemplate` is not called.
- Confirming delete and asserting `deleteQuickTemplate` receives the template id.

- [ ] **Step 2: Run tests to verify red**

Run: `corepack pnpm@10.33.2 --filter web test -- QuickTemplates.spec.tsx`

Expected: FAIL because the current page still uses old rounded/card-heavy classes and the new test file may assert Fluent-specific labels/classes not present yet.

- [ ] **Step 3: Implement minimal QuickTemplates UI changes**

Modify `packages/web/src/components/QuickTemplates.tsx` to:
- Import `fluentButton`, `fluentInput`, and `fluentTable`.
- Import `LoadingState`, `ErrorState`, and `EmptyState`.
- Replace old emerald buttons and rounded card table wrapper with Fluent helpers.
- Keep the existing modal workflow and real create/update/delete API calls.
- Keep delete confirmation via `confirmDialog` and error feedback via `alertDialog`.

- [ ] **Step 4: Run tests to verify green**

Run: `corepack pnpm@10.33.2 --filter web test -- QuickTemplates.spec.tsx`

Expected: PASS.

---

### Task 2: PhenologyAdmin Fluent Regression Coverage and Destructive Confirmation

**Files:**
- Create: `packages/web/src/components/PhenologyAdmin.spec.tsx`
- Modify: `packages/web/src/components/PhenologyAdmin.tsx`

**Interfaces:**
- Consumes: `CropPhenologyItem` and `CreateCropPhenologyDto` from `@nongchang/shared`; mocked API functions from `../api/phenology`; `DialogHost` from `../hooks/useDialog`; `showToast` from `../hooks/useToast`.
- Produces: Fluent-rendered phenology management with a confirmation gate before delete and tested real create/delete API behavior.

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/components/PhenologyAdmin.spec.tsx` with tests for:
- Rendering grouped phenology rows in a Fluent table wrapper and showing lifecycle summary copy.
- Creating a stage by filling crop, stage, expected days, and sort order, then asserting `createPhenology` receives numeric fields.
- Cancelling a delete confirmation and asserting `deletePhenology` is not called.
- Confirming delete and asserting `deletePhenology` receives the stage id.

- [ ] **Step 2: Run tests to verify red**

Run: `corepack pnpm@10.33.2 --filter web test -- PhenologyAdmin.spec.tsx`

Expected: FAIL because the current delete action has no confirmation dialog and the current UI does not use the expected Fluent table wrapper/state components.

- [ ] **Step 3: Implement minimal PhenologyAdmin UI changes**

Modify `packages/web/src/components/PhenologyAdmin.tsx` to:
- Import `fluentButton`, `fluentInput`, and `fluentTable`.
- Import `LoadingState`, `ErrorState`, and `EmptyState`.
- Import `confirmDialog` for destructive delete and `showToast` for success/error feedback.
- Replace local toast state and old emerald/modal classes with shared feedback and Fluent styling.
- Preserve grouping by crop, create payload construction, reload behavior, and backend error display.

- [ ] **Step 4: Run tests to verify green**

Run: `corepack pnpm@10.33.2 --filter web test -- PhenologyAdmin.spec.tsx`

Expected: PASS.

---

### Task 3: Slice Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/QuickTemplates.tsx`
- Verify: `packages/web/src/components/PhenologyAdmin.tsx`
- Verify: `packages/web/src/components/QuickTemplates.spec.tsx`
- Verify: `packages/web/src/components/PhenologyAdmin.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-08-p1-secondary-routed-fluent-surfaces.md`

**Interfaces:**
- Consumes: The changed components and tests from Tasks 1-2.
- Produces: A reviewed commit on the current branch.

- [ ] **Step 1: Run focused tests**

Run: `corepack pnpm@10.33.2 --filter web test -- QuickTemplates.spec.tsx PhenologyAdmin.spec.tsx`

Expected: PASS.

- [ ] **Step 2: Run Web verification**

Run: `corepack pnpm@10.33.2 --filter web lint`

Expected: exit 0.

Run: `corepack pnpm@10.33.2 --filter web test`

Expected: all Web tests pass.

- [ ] **Step 3: Scan old-style residue in target files**

Run: `rg -n "bg-emerald|text-emerald|border-emerald|from-emerald|to-green|rounded-2xl|rounded-3xl|bg-gradient|shadow-sm|shadow-xl" packages/web/src/components/QuickTemplates.tsx packages/web/src/components/PhenologyAdmin.tsx`

Expected: no output, except intentional non-dominant semantic danger/success styles if introduced by shared helpers.

- [ ] **Step 4: Review diff**

Run: `git -c safe.directory=E:/code/nongchang diff --check`

Expected: no whitespace errors.

Run: `git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/QuickTemplates.tsx packages/web/src/components/PhenologyAdmin.tsx packages/web/src/components/QuickTemplates.spec.tsx packages/web/src/components/PhenologyAdmin.spec.tsx docs/superpowers/plans/2026-07-08-p1-secondary-routed-fluent-surfaces.md`

Review checklist:
- Tests prove create/update/delete behavior through mocked real API wrappers.
- Delete is gated by confirmation in both pages.
- No backend contract, role navigation, or DTO changes are included.
- UI helpers come from the local Fluent system.

- [ ] **Step 5: Commit**

Run:
```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-08-p1-secondary-routed-fluent-surfaces.md packages/web/src/components/QuickTemplates.tsx packages/web/src/components/PhenologyAdmin.tsx packages/web/src/components/QuickTemplates.spec.tsx packages/web/src/components/PhenologyAdmin.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "feat(web): align secondary routed admin pages with Fluent"
```

Expected: commit created successfully.

## Self-Review

- Spec coverage: This plan implements the next priority slice from the SaaS UI completion audit: secondary routed production pages with high old-style residue and missing tests.
- Placeholder scan: No TBD/TODO/fill-later placeholders remain.
- Type consistency: The plan uses existing exported API/client names and shared type names visible in the current codebase.
- Scope check: This slice intentionally excludes `Settings`, `ProfileSettings`, `IntegrationSettings`, `AiAssistant`, and the large remaining `BatchAdmin` cleanup; those should be separate follow-up P1/P2 plans after this commit.
