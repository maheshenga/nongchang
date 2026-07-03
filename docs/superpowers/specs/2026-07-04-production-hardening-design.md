# Production Hardening and Authenticity Design

## Goal

Turn the current traceability SaaS from a feature-rich prototype into a production-facing system whose visible workflows are real, reliable, and testable.

The work prioritizes business-critical closures first: supply management, misleading UI surfaces, user-group authorization truthfulness, credit-account reliability, and session revocation behavior. It intentionally avoids broad rewrites until the visible product surface is trustworthy.

## Current Context

The repository is a pnpm monorepo with these main packages:

- `packages/backend`: NestJS, Prisma, PostgreSQL/PostGIS.
- `packages/web`: React/Vite management console.
- `packages/miniapp`: Taro farmer miniapp.
- `packages/shared`: shared DTOs, enums, and contracts.

Recent hardening already exists around tenant scope, account refresh, partial unique indexes, credit-account tenant scoping, and test workflow. Unit tests and type checks are healthy, but some visible product features are only partially connected to real backend behavior.

## Principles

1. Production navigation must only expose real workflows, or clearly disabled future workflows.
2. Business operations must use stable IDs internally and display human identifiers only as labels.
3. UI wording must not claim IoT, blockchain, payment, AI, permission, or alerting behavior unless the implementation exists.
4. Credit consumption must become auditable and eventually idempotent.
5. Security changes should be incremental and covered by tests before larger authorization refactors.

## Scope

This document is a production-hardening roadmap spec, not a single all-at-once implementation batch. Implementation should be split into focused plans. The first implementation plan covers Phase 1 and Phase 2 only, because those phases repair visible business workflows and remove misleading production surfaces. Phases 3 through 6 should each receive separate plans after the first production-facing corrections are merged.

### In Scope

- Supply management workflow closure.
- Web production-surface cleanup for misleading or demo-only capabilities.
- User group and permission truthfulness.
- Credit ledger reliability design and staged implementation path.
- WeChat OpenID uniqueness alignment.
- Session revocation hardening.
- Test and deployment verification gates.

### Out of Scope

- Full dashboard analytics rebuild.
- New IoT ingestion platform.
- Blockchain notarization.
- Real push notification platform.
- New payment channels beyond the existing Alipay integration.
- Large visual redesign unrelated to correctness.

## Phase 1: Supply Management Closure

### Problem

The web supply-management page is visible only to `system_admin`, but backend supply creation only allows `merchant`. The issue modal asks for a "batch number", while the backend expects `batchId`.

### Design

Expose supply management to merchants as a real working page. The page should load batches using the existing batch API and issue supplies using the selected batch's stable `id`. Human-facing labels should show `batchNo`, crop name, and owner context where available.

For system admins, the first production-safe version should be read-only unless the page adds an explicit merchant owner selector and uses that owner consistently across create and issue flows. The safer first implementation is to remove create and issue actions from the system-admin view.

### Backend Contract

Keep backend `IssueSupplyInput.batchId` unchanged. The frontend must adapt to it instead of changing the API to accept ambiguous batch numbers.

### Acceptance Criteria

- A merchant can open supply management from the main web navigation.
- A merchant can create supply inventory.
- A merchant can choose a batch from a dropdown and issue supply to it.
- The submit payload contains `batchId`, not `batchNo`.
- A user cannot issue supply to a batch outside the supply owner's scope.
- Existing 110 percent farm-record overuse protection still works.

## Phase 2: Production Surface Authenticity

### Settings

The current `Settings` component stores profile-like data in `localStorage` while presenting system-level capabilities such as IoT alarms, blockchain validation, and notification rules.

The production surface should either:

- Replace this page with real account settings backed by `/auth/me` and password-change endpoints; or
- Rename it to a local preference page and remove backend-sounding claims.

The recommended first step is to route account changes through the existing `ProfileSettings` surface and reduce `Settings` to non-critical local display preferences if it remains visible.

### Merchant Admin

Buttons that currently only show a toast or local preview must be handled explicitly:

- If a matching backend API exists, wire the button to it.
- If not, disable or hide the button.
- If the feature is intentionally future work, label it as unavailable and avoid implying that it is active.

The trace-label generation flow should distinguish between true code generation and visual preview. Any operation that consumes code credits must call the real trace API.

### Demo Components

`Dashboard` and `MobileView` contain static charts, local AI simulation, hardcoded logistics chains, and external placeholder images. They should not be part of the default production navigation.

Recommended treatment:

- Keep them as demo or legacy assets if still useful.
- Gate them behind an explicit development/demo flag.
- Extract real widgets, such as anti-fake monitoring, into production pages.

### Acceptance Criteria

- Default production navigation does not expose demo dashboards or simulated mobile flows.
- No primary action in visible pages completes only by local state or a placeholder toast.
- Settings text no longer claims unimplemented IoT, blockchain, or push-notification behavior.
- Any retained future feature is visually disabled or clearly marked unavailable.

## Phase 3: User Group and Permission Truthfulness

### Problem

User groups store `permissions`, but actual authorization is role-based through `@Roles` and `RolesGuard`.

### Short-Term Design

Rename the UI concept to "user groups" or "user grouping" and avoid saying that permissions are enforced. Permissions may remain stored as future metadata.

### Full Permission Design

Introduce permission enforcement after the product surface is cleaned up:

- Add a `@Permission('resource:action')` decorator.
- Add a `PermissionGuard` after `JwtAuthGuard`.
- Load the current user's group permissions from the database or a short-lived cache.
- Keep `@Roles` as the coarse gate and permissions as a finer gate.
- Start with high-value actions: supply create, supply issue, farm record create, trace code generation, batch status update, and user review.

### Acceptance Criteria

- In the short-term version, UI wording matches actual role-only enforcement.
- In the full version, tests prove users with the same role but different group permissions receive different authorization outcomes.

## Phase 4: Credit Reliability

### Problem

Trace-code generation and AI calls consume credits before the external or database operation finishes, then refund on failure. This compensation model is better than no refund but can still leave inconsistent balances if refund fails.

### Design

Move credit consumption toward a reservation model:

- `RESERVED`: credit has been held but not finalized.
- `CONFIRMED`: the business operation completed and credit is final.
- `RELEASED`: the business operation failed and credit was returned.

Introduce an idempotency key for business operations so repeated requests do not duplicate charges. Use a stable key derived from operation type, tenant, actor, target resource, and a client/request key where available.

### Staged Path

1. Add ledger metadata and audit SQL to detect suspicious consume/refund pairs.
2. Add idempotency key support to credit ledger writes.
3. Convert trace-code generation to reservation and confirmation.
4. Convert AI calls to reservation and confirmation.
5. Add a recovery command for stale reservations.

### Acceptance Criteria

- Repeating a trace-code generation request with the same idempotency key cannot double-charge.
- A failed trace-code generation releases the reservation.
- A failed AI provider call releases the reservation.
- Stale reservations can be found by audit SQL.
- Credit ledger remains understandable to existing billing views.

## Phase 5: WeChat Identity Consistency

### Problem

Authentication looks up WeChat users by `(tenantId, wxOpenid)`, but the Prisma schema declares `wxOpenid` globally unique.

### Design

Align the database constraint with the lookup model. Prefer `@@unique([tenantId, wxOpenid])` if each tenant maps to a configured WeChat app. If the product will support multiple WeChat apps per tenant, use `(wechatAppId, wxOpenid)` instead.

Given the current appId-to-tenant lookup, `(tenantId, wxOpenid)` is the recommended correction.

### Acceptance Criteria

- Schema and migration no longer imply global OpenID uniqueness.
- WeChat login and registration tests cover tenant-scoped lookup.
- Existing data is migrated safely.

## Phase 6: Session Revocation Hardening

### Problem

Access tokens are self-contained and valid for two hours. Refresh checks the database, but a disabled user or tenant may keep using an existing access token until expiry.

### Design

Shorten access-token lifetime and introduce a revocation version:

- Add `tokenVersion` or `sessionVersion` to `User`.
- Include the version in JWT payload.
- Increment the version on password change, user disable, and security-sensitive account changes.
- Have the auth guard reject tokens whose version no longer matches the database for high-risk endpoints or globally after performance testing.

### Acceptance Criteria

- Password change invalidates older tokens.
- User disable invalidates older tokens before natural expiry.
- Frontend refresh behavior remains stable under concurrent requests.

## Phase 7: Verification Gates

### Required Commands

- `corepack pnpm@10.33.2 --filter @nongchang/shared build`
- `corepack pnpm@10.33.2 --filter @nongchang/backend build`
- `corepack pnpm@10.33.2 --filter web lint`
- `corepack pnpm@10.33.2 test:unit`
- `corepack pnpm@10.33.2 test:e2e` after starting local PostGIS with `docker compose -f docker-compose.dev.yml up -d`

### New Test Coverage

- Web supply page sends `batchId` selected from loaded batches.
- Merchant can access supply management.
- System admin cannot accidentally create merchant-owned supply without an explicit owner selection.
- Settings no longer presents unimplemented system capabilities as active.
- Permission behavior matches either the short-term wording-only design or the full `PermissionGuard` design.
- Credit reservation behavior prevents duplicate charges.
- WeChat tenant-scoped OpenID behavior is covered.

## Rollout Order

1. Supply management closure.
2. Production surface authenticity cleanup.
3. User group wording correction or permission guard introduction.
4. Credit idempotency and reservation model.
5. WeChat uniqueness migration.
6. Session revocation hardening.
7. Final e2e and deployment documentation update.

## Risks

- Credit reservation changes touch billing invariants and require careful migration.
- Permission enforcement may surprise existing operators if enabled all at once.
- Demo component removal may affect stakeholder demos if no feature flag is provided.
- WeChat unique-index migration must inspect existing data before applying.

## Non-Goals for the First Implementation Plan

The first implementation plan should not implement every phase at once. It should start with supply management closure and production-surface authenticity, because those issues directly affect what users can see and do today. Later plans can handle credit reservations, WeChat identity migration, and session revocation as separate, testable changes.
