# Microsoft Fluent UI Redesign

Date: 2026-07-06
Status: design spec for review
Branch: `codex/microsoft-fluent-ui-redesign`
Concept image: `docs/superpowers/specs/assets/2026-07-06-microsoft-fluent-ui-redesign-concept.png`

## Goal

Redesign the web administration console with `方案 A: Microsoft Fluent 2 SaaS Console`. The result should look and behave like a production Microsoft 365 Admin Center or Azure Portal style SaaS console while preserving the current product workflows, real API behavior, permission model, and data boundaries.

This is a global UI refactor for `packages/web`, not a backend feature expansion. The redesign should improve clarity, density, trust, and operational efficiency for administrators, tenants, farm operators, and ordinary members.

## Inputs

`DESIGN.md` was requested but no `DESIGN.md` file exists in the current worktree. The implementation will use these inputs instead:

- The approved `方案 A` direction from the user.
- The generated concept image in this spec.
- Existing web app structure and current production workflows.
- Existing historical specs under `docs/superpowers/specs/`, especially the real admin design and production hardening design.

If a separate `DESIGN.md` is later provided, it should be reviewed before implementation continues.

## Visual Direction

The new visual system should be Fluent 2 inspired, not a pixel clone of Microsoft products. It should feel familiar to users of Microsoft 365 Admin Center, Azure Portal, and modern Windows enterprise tools.

Core traits:

- Light-first neutral workspace with white content surfaces and very light gray page background.
- Microsoft blue accent, centered around `#0078D4`.
- Segoe UI first typography stack, with Microsoft YaHei and system fallbacks for Chinese text.
- Compact enterprise density, optimized for tables, filters, command bars, and high-frequency operations.
- 1px separators and quiet borders instead of heavy shadows.
- Radius mostly `4px` to `8px`.
- Subtle selected states, focus rings, hover rows, command states, and status tags.
- No emerald/green gradient shell, no marketing hero, no large decorative cards, no fake metrics, no nested card stacks.

## Concept Summary

The concept screen shows the batch lifecycle management page:

- Left rail navigation with compact icons and clear active state.
- Top global bar with app launcher, search, utility icons, tenant/account area.
- Page breadcrumb and title: `批次全生命周期管理`.
- Command bar with `新建批次`, `导出`, `筛选`, `刷新`.
- Filter row for batch number, status, variety, field, and date range.
- Dense table with selectable rows, sort indicators, status tags, row actions, and pagination.
- Right inspector panel for the selected batch, with tabs and real operational details.

This anatomy becomes the default model for complex admin pages. Pages without enough detail for an inspector should still follow the same shell, title, command bar, filter, and table/list rules.

## App Shell

The app shell should be rebuilt around a Fluent console layout:

- Global top bar: app name, global search, utility actions, current tenant, user role/account.
- Left navigation: fixed desktop rail, collapsible on narrow screens, icon plus label, one clear active item.
- Main content: white page area with compact page header, optional breadcrumb, command bar, and content region.
- Presentation mode should preserve the real workflow but hide only nonessential chrome where it already does so.
- Role and tenant indicators must reflect real authenticated state. Do not invent notification counts, quotas, or tenant facts.

The current navigation items should be preserved unless an item is proven dead or inaccessible. Labels can be shortened for clarity, but route meaning must not change.

## Component System

Create a small local design system before touching individual pages. It should be simple enough for the existing Tailwind/Vite app and avoid a large external UI library migration.

Required component families:

- Command button: primary, secondary, subtle, danger, icon-only.
- Command bar: grouped page actions with stable spacing and disabled/loading states.
- Text input and select: compact height, clear focus ring, icon slot where needed.
- Filter bar: wraps predictably, never overlaps, works on mobile.
- Data table: header, selectable rows, sort affordance, hover, selected row, row actions, empty/loading/error states.
- Status tag: compact semantic variants for active, completed, warning, disabled, failed.
- Panel/dialog: right inspector, confirmation modal, form modal, destructive confirmation.
- Page header: breadcrumb, title, short helper text only when it improves workflow clarity.
- Toast/inline feedback: preserve existing behavior, restyle only.

Prefer shared CSS utility classes or small reusable React primitives where they reduce duplication. Avoid a broad rewrite of business logic just to move markup.

## Page Priorities

The first implementation pass should cover pages with the highest admin impact and most visible style debt:

1. App shell, navigation, login boundary, loading skeleton, top-level layout.
2. `BatchAdmin`: batch lifecycle table, filters, export/generate actions, details, QR/code dialogs.
3. `FarmFields`: field management forms and list/table surfaces.
4. `BillingAdmin`: subscription, payment, and billing operations with trustworthy status presentation.
5. `TenantManagement`: tenant administration and cross-tenant clarity.
6. `UserGroups`, `PendingUsers`, and related user-system pages.

Secondary pages should receive shared shell/component styling where possible, then targeted polishing if tests and screenshots show obvious drift.

## Interaction Rules

The redesign must keep functions truthful:

- Existing buttons must keep their current behavior or be removed if they are truly nonfunctional and not required.
- Loading, empty, error, disabled, destructive, and success states must remain visible and understandable.
- Search and filters should preserve existing filtering semantics unless a bug is intentionally fixed in the plan.
- Tables should remain keyboard and screen-reader friendly where current markup allows.
- Dangerous actions should keep confirmation safeguards.
- Billing and tenant actions must not imply capabilities that backend APIs do not provide.

No fake dashboards, fake health scores, fake AI insights, fake quota counters, or fake notification counts should be added for visual polish.

## Data Reliability

The UI refactor must not weaken data reliability:

- Preserve current API request/response contracts.
- Do not change backend DTOs, shared types, or persistence behavior in this UI phase unless a compile-breaking mismatch is discovered.
- Keep tenant, role, and user-group visibility rules intact.
- Preserve real identifiers, generated trace codes, billing order identifiers, and destructive action payloads.
- Continue to show backend errors instead of replacing them with generic success states.
- CSV/PDF/export paths must still use real selected data and current backend lifecycle data.

## Responsive Behavior

Desktop is the primary target, because this is a SaaS administration console. Mobile and tablet still need to be usable:

- Desktop: fixed left rail, top global bar, wide tables, optional right inspector.
- Tablet: collapsible rail, command bar wraps, inspector can become drawer.
- Mobile: rail becomes drawer, tables can use horizontal scroll or condensed row summaries, primary actions remain reachable, text does not overlap.

No text may visually overlap controls or adjacent content. Buttons and table cells should wrap or truncate intentionally with accessible titles where necessary.

## Implementation Boundaries

In scope:

- `packages/web` visual system, app shell, shared UI primitives, and priority admin pages.
- Tailwind/CSS token cleanup and replacement of green-gradient visual language.
- Browser screenshot QA for desktop and mobile.
- Tests and lint/type verification for affected web code.

Out of scope for this UI phase:

- Backend schema or permission redesign.
- Miniapp redesign.
- New analytics dashboards or reporting claims.
- Exact Fluent UI React package migration unless a small targeted dependency is justified in the implementation plan.
- Pixel-perfect Microsoft product cloning.
- Broad rewrite of every component if shared styling can cover lower-priority pages safely.

## Testing

Implementation must include:

- Web lint/type/test commands available in the repo.
- Full unit suite before final completion when practical.
- Local web server visual QA.
- Desktop screenshot verification against the concept.
- Mobile-sized screenshot verification for overflow, clipping, and navigation collapse.
- Manual checks for at least one core path on `BatchAdmin`, plus one tenant/user-system path if included in the slice.

Known environmental limit: backend e2e checks may remain blocked if local PostgreSQL/PostGIS is unavailable. This should be reported honestly and not described as passing.

## Acceptance Criteria

The redesign is acceptable when:

- The main admin shell visually matches the Fluent 2 SaaS Console direction.
- Priority pages no longer use emerald gradient/card-heavy styling as their dominant UI language.
- Batch management follows the concept anatomy: command bar, filters, dense table, clear row actions, optional inspector/dialog surfaces.
- Existing workflows still compile and tests pass.
- There are no new fake visible features.
- Desktop and mobile screenshots show no overlap, clipped primary content, or unusable controls.
- Code review finds no permission, billing, tenant isolation, or data-integrity regression introduced by UI changes.

## Spec Self-Review

Placeholder scan: no unresolved placeholder markers remain.

Consistency check: the spec keeps the work inside `packages/web`, preserves existing backend contracts, and uses the approved Microsoft Fluent 2 direction.

Scope check: the full redesign is large, so implementation should be planned in priority slices. The first slice must include app shell and `BatchAdmin`, then proceed to the next pages only after verification.

Ambiguity check: because `DESIGN.md` is missing, this spec explicitly defines the fallback inputs and requires review if that file appears later.
