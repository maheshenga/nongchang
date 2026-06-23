# Miniapp Field-First UI Redesign

## Goal

Improve the miniapp's real mobile experience around daily field work while keeping the existing API contracts and page routes unchanged.

## Scope

The redesign covers five high-traffic surfaces:

- `pages/work`: operator dashboard, batch overview, recent records, quick actions.
- `components/RecordForm`: field record submission, batch/action/material/image/location inputs.
- `pages/trace`: recent traceability chain review and poster generation entry.
- `pages/login`: first-run sign-in and registration entry.
- `pages/me`: operator identity, stats, profile/security/field management.

Backend behavior, request payloads, authentication flow, and tab routing stay unchanged.

## Design Direction

The miniapp should feel like a field operator tool, not a shrunken admin dashboard. The first screen emphasizes status, immediate actions, and readable operational cards. Forms are grouped by task sequence so the user can complete a farm record while standing in the field with one hand.

The visual language keeps the current emerald agricultural brand, but adds softer panels, clearer section headers, smaller dense metadata, and stable chip/card dimensions for narrow screens.

## Page Designs

### Work Dashboard

The header becomes a compact field status panel: title, crop subtitle, network state, and quota summary. Batch cards show batch number, crop name, and a short status line. Recent records use a timeline-like list with action chips and optional thumbnail. Quick actions remain horizontal, but receive clearer disabled/reserved states.

### Record Form

The form becomes a sequence of sections:

1. Target batch and scan entry.
2. Field context helpers: AI advice and location capture.
3. Cost and labor.
4. Material selection and amount.
5. Notes, action tags, voice, images.
6. Submit.

Material chips become bounded two-line cards with ellipsis for long names and remaining quantity pinned below. The amount input is full-width with an inline unit badge, so small screens do not overflow.

### Trace Page

The trace page adds a selected-batch summary card before the timeline. It shows crop, batch number, and node count. Chain proof data remains clearly marked as pending integration, but appears as a status panel rather than faded filler.

### Login Page

The login page keeps the existing credential and WeChat paths. The hero is tightened and the card gets a clearer product promise, better input rhythm, and a safer visual hierarchy for registration.

### Me Page

The profile page gets a more structured identity header, compact stats panel, grouped menu items, and clearer edit/password panels. Field map/list display remains functionally unchanged.

## Interaction Rules

- No new backend calls.
- No hidden behavior changes to form payload generation.
- Preserve existing toasts and validations.
- Keep tabBar and route paths unchanged.
- Touch targets should remain comfortably large.
- Long chip text must ellipsize rather than widening the layout.

## Verification

Run:

- `rtk pnpm --filter @nongchang/miniapp test`
- `rtk pnpm --filter @nongchang/miniapp build:weapp`

Inspect generated `packages/miniapp/dist` for the expected pages and RecordForm supply payload fields.
