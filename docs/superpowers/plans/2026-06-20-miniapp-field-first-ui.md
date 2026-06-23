# Miniapp Field-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the miniapp UI around field work, traceability, login, and profile pages without changing backend contracts.

**Architecture:** Keep the current page/component boundaries. Add reusable visual primitives to `styles/theme.scss`, then apply them in existing SCSS modules and small JSX structure adjustments where data hierarchy needs clearer cards.

**Tech Stack:** Taro 4, React 18, SCSS with existing `@use '../../styles/theme.scss' as *`, Vitest.

---

### Task 1: Theme Primitives

**Files:**
- Modify: `packages/miniapp/src/styles/theme.scss`

- [ ] Add shared tokens for muted surfaces, shadows, and action rows.
- [ ] Add mixins: `section-title`, `soft-panel`, `primary-action`, `status-pill`.
- [ ] Verify Sass compiles through `rtk pnpm --filter @nongchang/miniapp build:weapp`.

### Task 2: Work Dashboard

**Files:**
- Modify: `packages/miniapp/src/pages/work/index.tsx`
- Modify: `packages/miniapp/src/pages/work/index.scss`

- [ ] Add header meta rows for online/offline and quota summary.
- [ ] Add card headers with short supporting copy.
- [ ] Restyle batch cards, recent record rows, and quick actions.
- [ ] Preserve all API calls and navigation behavior.

### Task 3: Record Form

**Files:**
- Modify: `packages/miniapp/src/components/RecordForm/index.tsx`
- Modify: `packages/miniapp/src/components/RecordForm/index.scss`

- [ ] Group fields into visual sections.
- [ ] Restyle scan/advice/location action rows.
- [ ] Restyle supply chips as bounded two-line material cards.
- [ ] Keep `buildFarmRecordPayload`, `supplyId`, and `supplyAmount` submission logic unchanged.
- [ ] Preserve validation behavior from `getSupplyAmountError`.

### Task 4: Trace Page

**Files:**
- Modify: `packages/miniapp/src/pages/trace/index.tsx`
- Modify: `packages/miniapp/src/pages/trace/index.scss`
- Modify: `packages/miniapp/src/components/TraceTimeline/index.scss`

- [ ] Add selected batch summary with node count.
- [ ] Improve trace chip and chain proof panel hierarchy.
- [ ] Keep poster generation behavior unchanged.

### Task 5: Login and Me Pages

**Files:**
- Modify: `packages/miniapp/src/pages/login/index.tsx`
- Modify: `packages/miniapp/src/pages/login/index.scss`
- Modify: `packages/miniapp/src/pages/me/index.tsx`
- Modify: `packages/miniapp/src/pages/me/index.scss`

- [ ] Tighten login hero and form rhythm.
- [ ] Add lightweight login trust hints without new behavior.
- [ ] Group profile menu sections visually.
- [ ] Improve edit/password panels while preserving validation and API calls.

### Task 6: Verification

**Files:**
- Test output only.

- [ ] Run `rtk pnpm --filter @nongchang/miniapp test`.
- [ ] Run `rtk pnpm --filter @nongchang/miniapp build:weapp`.
- [ ] Check generated work page bundle still includes `supplyId` and `supplyAmount`.
- [ ] Run `rtk git diff --check`.
