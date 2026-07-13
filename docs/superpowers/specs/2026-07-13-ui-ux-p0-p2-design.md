# Nongchang UI/UX P0-P2 Improvement Design

## Context

The current React web console and Taro miniapp implement the core agricultural SaaS loop, and their production builds, browser smoke tests, and automated accessibility checks are green. Rendered QA nevertheless found two interaction blockers and a broader set of workflow, information architecture, accessibility, localization, and performance problems.

The approved scope is the complete P0-P2 audit from 2026-07-13. No listed issue is intentionally deferred. Delivery is split into independently testable stages so each stage can be reviewed and reverted without destabilizing the whole product.

## Goals

- Remove the field-dialog stacking defect and the unusable mobile batch table.
- Make dashboards, navigation, recovery guidance, and primary actions role-appropriate.
- Replace user-visible technical identifiers with friendly business identities.
- Complete public trace lookup, trace-code generation, onboarding, AI, and farm-record workflows.
- Give miniapp users draft protection, actionable quick actions, honest offline behavior, and durable success states.
- Standardize dialogs, loading states, Chinese copy, focus handling, and bounded page retention.
- Preserve existing API truthfulness, tenant authorization boundaries, credit accounting, and demo/production separation.

## Non-goals

- Replacing React, Taro, TanStack Query, Tailwind, or the Fluent-derived visual system.
- Rewriting backend business modules that already expose sufficient data.
- Adding speculative AI, IoT, or map functionality when the backing service is unavailable.
- Changing public trace semantics or credit charging rules without matching backend contract tests.
- Creating a separate mobile web application; responsive web remains one application.

## Delivery Approaches Considered

### Patch each visible defect independently

This is the lowest short-term effort, but it preserves competing modal layers, repeated responsive table mistakes, duplicated identity formatting, and inconsistent recovery patterns. It does not satisfy the full P2 scope.

### Incremental shared foundations plus workflow migrations

This is the selected approach. First create small shared primitives for dialogs, responsive data presentation, identity labels, loading copy, and page retention. Then migrate the affected workflows in priority order. Existing component and API boundaries remain intact unless the change directly improves the approved workflow.

### Full console and miniapp redesign

This could produce the cleanest visual reset but would combine behavioral, architectural, and aesthetic risk in one release. It is rejected because the current product already has substantial tested behavior that should be preserved.

## Architecture

### Dialog and overlay foundation

All blocking dialogs will render through one portal-based modal surface above the application shell. The surface owns backdrop layering, focus entry, focus trapping, Escape handling, body scroll locking, accessible title/description linkage, and focus restoration.

Feature components continue to own their forms and mutations, but they provide dialog content rather than absolute-positioned overlays. Non-blocking map detail cards remain inside the map stacking context and cannot exceed the global dialog layer.

### Responsive data presentation

Desktop retains dense tables where comparison is important. At narrow widths, batch and similar action-heavy tables switch to semantic cards that expose the same data and callbacks. The desktop table retains horizontal containment as a defensive fallback, but no required action may depend on horizontal scrolling on a 390-pixel viewport.

Row actions follow a three-level model:

1. row/card activation opens details;
2. one context-dependent primary action stays visible;
3. remaining actions live in a labelled overflow menu.

Destructive actions remain visually and semantically separated and require confirmation.

### Friendly identity boundary

UI view models resolve field, batch, operator, merchant, and tenant names before rendering. A reusable identity helper provides a friendly label plus an optional short technical identifier for detail views and copy actions. Tables, cards, exports, and filters use the same mapping so users do not see inconsistent names.

When the necessary related entity is unavailable, the UI displays a neutral business fallback such as `未知地块` and exposes the technical ID only in an expandable diagnostic detail.

### Role-specific workspaces

The production dashboard receives the authenticated role and renders a role-specific workspace:

- merchant: today's work, pending farm records, active batches, inventory/credit warnings, and quick entry actions;
- agent: merchant exceptions,辖区 batches, account/credit warnings, and merchant management shortcuts;
- tenant system administrator: pending onboarding, integration gaps, tenant production exceptions, account/credit warnings, and administrative shortcuts;
- platform administrator: tenant lifecycle and platform health entry points;
- member: personal trace and account entry points.

Shared metrics remain reusable, but each card must either navigate to the supporting record set or be explicitly informational.

### Public trace workflow

The public landing page adds a trace-code lookup form that navigates to the existing hash route. The trace page adds merchant identity, verification time, scan count explanation, anti-counterfeit guidance, support/report entry points, and a persistent lookup-again action.

Invalid, frozen, network-error, and empty-record states remain distinct. Invalid results permit re-entry or rescanning instead of only returning to browser history. The page does not claim authenticity beyond the actual public record returned by the API.

### Trace-code generation workflow

Before generation, the merchant sees current code balance, requested quantity, expected remaining balance, batch identity, and charging rule. Large or balance-consuming generation uses a confirmation dialog. Insufficient balance links to the permitted billing or escalation path for the current role.

The generic product name is `产品档案` and the generic operational name is `田间工作台`. Crop-specific wording can be supplied by tenant configuration later, but the default UI must not claim that all batches are peony.

### AI workspace

AI functions are separated into task tabs: knowledge Q&A, visual diagnosis, data Q&A, farm advice, and batch diagnosis. A shared status strip shows provider readiness, available AI balance, and the charging/privacy notice relevant to the selected task.

Results persist in an in-session history workspace so switching tasks does not erase the current answer. Batch and field pages can open the AI workspace with context through typed navigation state rather than asking the user to select the same entity again.

No prompt, image, provider, price, or retention claim is invented. Readiness and quota states come from existing APIs; unavailable information is labelled unavailable.

### Miniapp field-work workflow

Quick actions must perform their named action. `手写农事` scrolls to and focuses the record form. `地块定位` opens the location section and requests location only after a direct user action. Quick templates apply values and move the user to the changed section.

The record form stores a local draft containing only non-secret form fields and uploaded file URLs. It restores the draft after navigation or restart, warns before discarding meaningful input, and presents a submission summary for confirmation. Successful submission shows a durable receipt with record identity and actions to view the record or create another.

Offline state is honest: the app does not claim successful submission. Users can continue editing the local draft, while submit and AI network actions explain that connectivity is required. An offline sync queue is not introduced in this scope.

Registration success opens an application-status view containing the submitted name, status, application identifier when returned by the API, and guidance for the next step. If the current backend does not return an identifier, the view states that no tracking number is available and does not fabricate one.

### Shell, navigation, loading, and performance

Loading copy distinguishes session restoration, route/component loading, and data loading. Chinese is the default product language; remaining English status, pagination, and navigation labels are translated except for recognized technical product names.

System navigation groups are collapsible and remember local open/closed preferences. The duplicate billing shortcut is removed. The account header shows a skeleton or neutral account label until the profile loads and never flashes a raw user ID.

Visited pages use a bounded retention policy. The active page is always mounted, and at most two recently used eligible pages remain cached. Heavy map, chart, AI, and print surfaces can opt out of retention. TanStack Query remains the server-state cache and idempotent GET requests may retry once for transient network failures while mutations never retry automatically.

Large optional dependencies remain behind explicit lazy boundaries. Demo charts, html2canvas, print preview, and AI task implementations are loaded only when opened.

## Error Handling

- Permission-aware recovery messages name the actor who can fix the problem and provide only routes available to the current role.
- Network failures preserve stale data when available and expose a retry action.
- Form validation is field-specific; global toasts supplement rather than replace visible errors.
- Credit-consuming actions never retry automatically and always reuse their current idempotency boundary.
- Dialog closure during submission is blocked or confirmed according to whether the mutation has started.
- Failed miniapp submissions preserve the draft and uploaded evidence.
- Integration settings identify changed sections, validate before save, warn on navigation with unsaved changes, and provide a non-mutating connection/configuration test where the backend supports it.

## Accessibility

- All dialogs meet keyboard entry, Tab/Shift+Tab containment, Escape, accessible naming, and focus-return requirements.
- Overflow menus expose `aria-haspopup`, `aria-expanded`, and keyboard navigation.
- Mobile cards preserve table relationships through explicit labels rather than visual position alone.
- Status is not communicated by color alone.
- Loading and mutation completion use appropriate live-region semantics without repeating announcements.
- Touch targets are at least 44 CSS pixels in mobile web and the equivalent Taro sizing in the miniapp.

## Testing Strategy

### Unit and component tests

- Dialog layering, focus trap, Escape handling, and focus restoration.
- Batch table/card breakpoint behavior and complete action reachability.
- Friendly identity mapping and missing-entity fallbacks.
- Role-specific dashboard composition and navigation callbacks.
- Trace lookup routing and invalid/frozen/network state actions.
- Balance calculation and generation confirmation behavior.
- AI task switching, readiness display, and in-session result retention.
- Miniapp quick-action navigation, draft persistence, discard confirmation, offline submission guard, and success receipt.
- Navigation localization, collapsible groups, and bounded page retention.

### Browser tests

- Desktop widths: 1280 and 1440 pixels.
- Responsive widths: 768 and 390 pixels.
- System administrator, agent, merchant, member, and public users.
- Keyboard-only dialog and overflow-menu flows.
- Valid, invalid, frozen, and empty public trace states.
- Visual regression coverage for the field dialog and mobile batch cards.

### Verification gates

- Focused tests run red before each implementation slice and green afterward.
- Web and miniapp type checks and production builds pass.
- Existing browser and accessibility suites remain green.
- The complete local verification gate runs after all stages.
- Browser console contains no application errors in the audited flows.

## Delivery Stages

### Stage 1: P0 blockers and interaction foundations

- Portal dialog foundation and migration of field/create and high-risk batch dialogs.
- Mobile batch cards, responsive action model, and desktop overflow defense.
- Regression tests for stacking, focus, 390-pixel action reachability, and destructive confirmations.

### Stage 2: P1 web workflows

- Friendly identities and permission-aware map recovery.
- Role-specific dashboards and task navigation.
- Batch action consolidation and farm-record completion confirmation/undo affordance.
- Public lookup/trust/error recovery.
- Trace-code balance/confirmation and generic product wording.
- AI task workspace and integration-settings recovery affordances.

### Stage 3: P1 miniapp workflows

- Functional quick actions and honest offline state.
- Record draft, summary confirmation, submission receipt, and recovery.
- Registration status experience and generic crop wording.

### Stage 4: P2 consistency and performance

- Localized copy and pagination.
- Collapsible navigation, account-loading identity, and duplicate shortcut removal.
- Bounded page retention and query retry policy.
- Lazy-boundary verification and final responsive/accessibility browser pass.

## Acceptance Criteria

The work is complete only when every audit item maps to a passing automated test or a documented browser assertion, both P0 defects are reproduced by tests before their fixes, all supported roles can reach their corrective actions, no required mobile action is clipped, and the final production builds and repository verification gates pass without modifying or discarding unrelated user changes.
