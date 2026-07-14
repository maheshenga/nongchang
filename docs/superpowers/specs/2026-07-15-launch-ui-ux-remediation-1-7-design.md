# Launch UI/UX Remediation 1-7 Design

**Status:** Approved for implementation by the user on 2026-07-15

## Context

The production-hardening branch already has green shared, backend, Web, miniapp unit, rendered miniapp, production-build, and dependency-audit gates when the miniapp build receives valid production API and WeChat values. The latest rendered audit found seven remaining launch-facing gaps: incomplete production contacts and tenant readiness visibility; poor mobile merchant/batch controls; undersized Web touch targets; an overloaded system-admin navigation hierarchy and duplicate page headings; a long legal editor with separated save/publish actions and no preview; buried miniapp profile/export actions; and production-visible demo/legacy branding and an avoidable anonymous refresh request.

This design closes those gaps without replacing the established Fluent Web console or emerald miniapp visual systems.

## Approaches Considered

### A. Seven ordered, independently testable launch-remediation slices

Implement the confirmed findings in dependency order. Add a typed readiness contract first, then improve the highest-friction mobile operations, apply shared interaction sizing, simplify information architecture, improve legal publishing, improve the miniapp account workflow, and finish with production/demo/branding isolation. This is selected because each slice has a focused test and rollback boundary while the final result is coherent.

### B. P0/P1 configuration and mobile fixes only

This would reduce immediate launch risk but leave legal publishing, miniapp export, duplicate hierarchy, demo exposure, and legacy payload concerns unresolved. It is rejected because the user explicitly approved all seven recommendations.

### C. Full visual redesign

Replace the current Web and miniapp systems with a new design language. This is rejected because it would expand the regression surface without improving readiness correctness or workflow closure.

## Global Invariants

- Existing role, tenant, owner, and permission boundaries remain fail-closed.
- Readiness responses contain booleans, labels, and safe navigation hints only; they never return credentials, secret presence details beyond configured/not configured, or internal configuration values.
- Web remains Fluent-styled and desktop-dense while controls become at least 44 CSS pixels on coarse-pointer/mobile contexts.
- Miniapp remains emerald-styled and uses native Taro buttons for actionable surfaces.
- Existing public trace, login, account closure, and JSON data-export contracts remain compatible.
- New behavior follows red-green-refactor and retains the repository's full `verify:local` gate.

## 1. Production Configuration and Tenant Readiness Gate

Production miniapp configuration must require a non-empty `TARO_APP_SUPPORT_CONTACT` in addition to the existing HTTPS API and valid WeChat AppID checks. The Web production build receives a pure public-config validator that requires a non-empty `VITE_PUBLIC_SALES_CONTACT`; development and tests may continue rendering an honest unavailable state.

Add an authenticated `GET /api/readiness/tenant` endpoint for `SYSTEM_ADMIN`. It returns a typed list of readiness checks and an overall `ready` flag. Required checks are:

- a current legal publication;
- enabled WeChat integration;
- enabled OSS configuration;
- enabled Tianditu map integration;
- enabled AI provider;
- enabled Alipay configuration;
- at least one usable positive AI or trace-code credit balance in the tenant;
- a valid public API domain, support contact, and sales contact as reported from sanitized server-side deployment configuration.

Each failed check includes a stable code, Chinese operator-facing label, and a Web navigation target when the console can resolve it. The system-admin production dashboard renders a launch-readiness panel before operational metrics. Loading or endpoint failure is visible and retryable; it never silently reports ready.

## 2. Agent Mobile Cards and Batch Filter Redesign

At widths below `md`, `MerchantManagement` replaces the 980-pixel table with cards. Every card keeps the merchant name, username/phone, field and area summary, status, created date, and visible edit/status actions. Desktop retains the current table and pagination.

`BatchCommandBar` keeps search always visible and moves crop, field, date, and reset into one expandable filter panel. The collapsed trigger shows an active-filter count. No duplicate select controls remain. Primary create/export actions remain available without horizontal scrolling.

## 3. Global Mobile Touch Targets

Shared Fluent button, input, select, status, and pagination styles retain 32-pixel desktop density but become at least 44 pixels under coarse-pointer media queries and on explicitly mobile navigation surfaces. Icon buttons also reach 44 by 44 pixels. The rule is centralized in shared CSS/classes instead of patched page by page. Dense desktop tables keep their existing row rhythm.

## 4. Admin Information Architecture and Heading Cleanup

System-admin navigation is reorganized into four understandable groups:

- Production: overview, fields, records, phenology, batches, logistics.
- Organization: agents, merchants, user groups, admission review.
- Intelligence and billing: AI assistant, AI providers, credit/billing.
- Configuration and compliance: AI/storage, integrations, quick templates, legal, local preferences.

Routes, tab IDs, permissions, and deep links do not change. The shell keeps the breadcrumb but removes its duplicate outer `<h2>` and role subtitle because routed workspaces already own their page heading. Accessible page identity comes from the active workspace heading and document title.

## 5. Legal Editor Workflow

The legal settings page gains a draft preview mode that renders both documents as escaped plain text with their version and operator metadata. A sticky bottom action bar keeps save and publish together. Publish remains disabled until the current valid draft is saved. The preview explicitly distinguishes saved draft from current published version, and publish confirmation continues creating an immutable backend snapshot.

Validation errors remain inline and focus moves to the error summary or first invalid field. Closing or navigating away with a dirty draft continues using the existing unsaved-change contract.

## 6. Miniapp Me and Data Export Workflow

Profile editing and password changes become dedicated pages opened from the top menu instead of panels appended after all page content. The existing auth APIs and validation rules remain unchanged. `Me` remains the summary and navigation surface.

The account-data page moves the export action next to the identity summary, formats generated/record dates with the Chinese locale, and uses category-specific human labels that never fall back to opaque internal IDs. Empty labels use stable descriptions such as `未命名记录`. Export offers JSON (complete machine-readable copy) and CSV (human-readable flattened summary) through a format query while preserving the current JSON URL default. Saved and shared filenames match the chosen format.

## 7. Demo Isolation, Branding Consistency, and Legacy Cleanup

Dashboard demo code is compiled and reachable only when `VITE_ENABLE_DEMO_DASHBOARD=true`; normal production builds do not render the entry or import its chunk. The demo remains clearly badged when enabled.

Web and miniapp use the generic product name `农场溯源管理`; hard-coded `芍药工作台` branding is removed from production miniapp configuration and theme comments. Unreferenced `SystemAdmin.tsx`, `AgentPlatform.tsx`, and `components/legacy/MobileView.tsx` are deleted after reference tests prove they are outside production routing.

Anonymous Web bootstrap stops using a failing refresh call as session discovery. A public, cache-disabled session endpoint returns 204 when no refresh cookie exists and returns a fresh access token only for a valid session. The client calls this endpoint on startup, so an expected anonymous visit produces no 401 console/network error.

## Error Handling

- Missing required production public contacts fail the corresponding production build with the exact variable name.
- Readiness query failure renders an unknown/not-ready state with retry; it does not infer readiness from cached UI data.
- Mobile card actions use the same confirmations, loading states, and error dialogs as desktop rows.
- CSV export enforces the existing row and byte limits and uses the same legal contact escalation path as JSON.
- Demo-disabled code paths return no entry and cannot be reached by changing client state.
- Anonymous session discovery distinguishes no session (204) from unavailable backend (network/server error).

## Verification

Each numbered slice must have a focused failing test before production changes and a focused green run afterward. Completion additionally requires:

- shared, backend, Web, miniapp unit, and miniapp rendered tests;
- Web typecheck and repository ESLint;
- production Web and miniapp builds with safe non-secret validation values;
- production dependency audit;
- Playwright desktop and 390-pixel mobile checks for merchant cards, batch filters, navigation, legal preview/sticky actions, demo absence, and anonymous console health;
- rendered miniapp checks for Me navigation, profile/password pages, account-data export placement and format selection;
- `git diff --check` and a requirement-by-requirement self-review before the final commit.

## Non-goals

- Changing tenant roles, permissions, or API authorization semantics.
- Making every optional integration mandatory for all future editions; this launch profile treats the named capabilities as required and can later introduce named readiness profiles.
- Replacing Fluent, Tailwind, Taro, or the current component libraries.
- Adding rich-text or HTML legal content.
- Replacing the existing scoped personal-data export with an administrator bulk export.
