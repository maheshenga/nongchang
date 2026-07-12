# Project Hardening 1–7 Design

**Status:** Approved for planning on 2026-07-13

## Context

The repository already delivers the core agricultural SaaS loop across the NestJS backend, React web console, Taro miniapp, shared Zod contracts, and PostgreSQL/PostGIS. Fresh verification showed that all three unit suites and all production builds pass, but seven release-readiness gaps remain:

1. Production dependency audit reports one critical and five high-severity vulnerabilities.
2. The miniapp production build succeeds with a placeholder API URL and an empty WeChat AppID.
3. CI does not build the web or miniapp production bundles and does not run the configured ESLint rules.
4. The web client stores both access and refresh tokens in `localStorage`.
5. AI credit reservations can become ambiguous when the provider succeeds but reservation confirmation fails.
6. Database-backed E2E has not been run in the current environment, and tenant consistency is not fully enforced by the database.
7. Public trace reads are transaction-heavy, operational health signals are absent, and several frontend files have become oversized.

The work will be delivered in three independently verifiable stages so that each stage can be reviewed, deployed, and rolled back without coupling all seven concerns into one release.

## Goals

- Remove all critical and high vulnerabilities reported by `pnpm audit --prod` without breaking NestJS, Taro, or Vite production builds.
- Make an invalid miniapp production configuration fail before bundle generation.
- Make the repository's production verification command exercise every production artifact and security gate.
- Keep refresh tokens out of web JavaScript-readable storage while retaining the current miniapp token protocol.
- Give every AI provider call a durable state that can be reconciled without automatically granting free successful calls.
- Run the full PostGIS E2E gate and add database enforcement for tenant and ownership consistency.
- Reduce public trace transaction duration, add deployable health and request-log signals, and split the largest production-facing frontend units.

## Non-goals

- Replacing NestJS, Prisma, React, Taro, PostgreSQL, or the existing deployment topology.
- Introducing Redis, Kafka, a background queue, or a third-party APM as a prerequisite.
- Rewriting all frontend components or all API contracts in one pass.
- Changing the miniapp's existing bearer-token protocol.
- Storing AI prompts or provider responses in the reconciliation table.

## Delivery Strategy

### Stage A: Release and Security Baseline

Stage A covers dependency remediation, miniapp production configuration, CI gates, and web authentication storage. It must leave existing backend and miniapp clients compatible.

### Stage B: Financial and Data Consistency

Stage B introduces durable AI operation states, runs the PostGIS test gate, and adds database constraints. Schema changes are additive before they become enforcing, and migrations must reject inconsistent historical data with an actionable audit result.

### Stage C: Performance and Engineering Operations

Stage C shortens the public trace write path, adds health and structured request logging, removes avoidable scope-query expansion, splits oversized frontend units, and consolidates the response contracts touched by those splits.

## Stage A Design

### Dependency remediation

The preferred remediation order is:

1. Upgrade the direct parent package when a compatible release resolves the vulnerable transitive dependency.
2. Use a root `pnpm.overrides` entry only when the parent package has no compatible patched release and the patched transitive version passes all builds and tests.
3. Do not suppress advisories or lower the audit threshold.

The release gate is zero critical and zero high findings from `pnpm audit --prod --audit-level high`. The known priorities are Multer, Swiper through Taro, and Glob in the build chain. Multer is runtime-reachable through image and voice upload endpoints, so its patched version is mandatory even if Taro remediation takes a parent-package upgrade.

### Miniapp production configuration

Production miniapp configuration will be validated by a pure helper that receives an environment object and returns normalized values or throws. The validator will require:

- `TARO_APP_API` to be an HTTPS URL.
- The hostname not to contain `REPLACE_ME`.
- The pathname to end in `/api` after trailing-slash normalization.
- `TARO_APP_WX_APPID` to match `^wx[0-9A-Za-z]{16}$`.

`config/prod.ts` will call the validator during configuration evaluation. There will be no production fallback URL or empty AppID. CI will provide `https://api.ci.invalid/api` and `wx0000000000000000`, which satisfy the shape checks without representing production credentials. Unit tests will prove that missing, HTTP, placeholder, malformed, and valid configurations behave correctly. A post-build smoke assertion will also reject `REPLACE_ME.example.com` in `packages/miniapp/dist`.

### Repository and CI gates

Root scripts will expose explicit commands for:

- shared build;
- backend build;
- web typecheck and production build;
- miniapp production build;
- ESLint across backend, web, miniapp, and shared source;
- all unit suites;
- backend PostGIS E2E;
- production dependency audit.

`verify:local` will run builds, type checking, ESLint, unit tests, and dependency audit. `verify:production` will extend it with PostGIS E2E. GitHub Actions will invoke the same root commands rather than maintain a divergent command list. CI will pass non-secret miniapp validation values and will continue using disposable test-only JWT and encryption keys.

### Web refresh-token cookie protocol

Existing `/auth/login` and `/auth/refresh` endpoints remain unchanged for the miniapp and other bearer-token clients.

The web client will move to three web-specific endpoints:

- `POST /api/auth/web/login`: validates the existing login DTO, sets the refresh cookie, and returns `{ accessToken }`.
- `POST /api/auth/web/refresh`: reads the refresh cookie, rotates it, and returns `{ accessToken }`.
- `POST /api/auth/web/logout`: expires the refresh cookie and returns `204`.

The cookie contract is:

- name: `nc_refresh`;
- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` in production;
- path `/api/auth/web`;
- maximum age seven days.

The web token store will retain the access token in module memory only. Application bootstrap will attempt the cookie refresh endpoint before deciding that the user is unauthenticated. A page reload therefore restores a valid session without exposing the refresh token to JavaScript. Logout and password change will clear local access state and call the web logout endpoint. The miniapp continues storing and rotating its current token pair.

The static deployment documentation will add CSP, HSTS, Referrer-Policy, Permissions-Policy, and frame restrictions for the web site. The CSP will permit the application's own scripts and styles plus the explicitly required map/payment destinations; it will not use a wildcard source.

## Stage B Design

### Durable AI operation lifecycle

A new Prisma `AiOperation` record will contain:

- tenant, user, provider, operation kind, and operation key;
- the linked credit reservation ID;
- one of `RESERVED`, `IN_FLIGHT`, `SUCCEEDED`, `FAILED`, `CONFIRMED`, `RELEASED`, or `REVIEW_REQUIRED`;
- a short non-sensitive error category when a provider call fails;
- timestamps for creation and last update.

The operation key is unique within a tenant. Prompts, images, audio, provider credentials, and provider response bodies are not stored.

The provider-call sequence becomes:

1. Create the operation as `RESERVED` and reserve the credits.
2. Persist `IN_FLIGHT` before starting the external request.
3. On provider failure, persist `FAILED`, release the reservation, then persist `RELEASED`.
4. On provider success, persist `SUCCEEDED`, confirm the reservation, then persist `CONFIRMED`.
5. If a database transition fails after the external call, preserve the non-terminal reservation for reconciliation instead of releasing it blindly.

Stale-reservation recovery will reconcile AI reservations by operation state:

- `RESERVED` or `FAILED`: release;
- `SUCCEEDED`: confirm;
- `IN_FLIGHT` or a missing/inconsistent operation: mark `REVIEW_REQUIRED` and leave the balance reserved;
- terminal states: skip.

This favors financial correctness over automatically returning an ambiguous reservation. The existing trace-code recovery remains intact and continues confirming reservations when generated codes already exist.

### PostGIS E2E gate

The implementation session will start the repository's PostGIS Docker service, deploy migrations, run the guarded demo seed against the local test database, run the consistency audit, and execute all backend E2E specifications. The E2E precheck remains authoritative: no E2E pass may be reported unless the complete command exits zero.

Additional E2E cases will cover:

- web cookie login, refresh rotation, logout, and password-revoked cookies;
- AI operation recovery for every non-terminal state;
- direct SQL attempts that violate tenant or owner consistency;
- public trace scan recording after the transaction split;
- health readiness with an available and unavailable database.

### Database enforcement

Every business table that carries `tenant_id` will receive a foreign key to `tenants(id)` unless it already has one. The migration will run the existing consistency audit before enabling constraints and will abort with a clear error when historical data is inconsistent.

Cross-table consistency will be enforced with PostgreSQL constraint triggers because the existing Prisma relations use single-column IDs and changing every relation to composite keys would create a much larger client/API migration. The triggers will enforce at least the invariants already covered by `audit-data-consistency.sql`:

- batch tenant/owner matches its field;
- farm record tenant/field matches its batch and field owner;
- supply issue tenant/owner matches its supply and batch;
- farm-record supply tenant/owner matches its batch;
- trace code, event, credential, and scan tenant matches the referenced batch;
- credit reservation tenant matches its credit account.

The audit SQL will be expanded to cover the same invariants so operators can diagnose a rejected migration before retrying it. Trigger errors will use stable constraint names and concise messages suitable for E2E assertions and operational troubleshooting.

## Stage C Design

### Public trace query and write path

Public trace will no longer wrap all reads in a single interactive transaction. The new flow is:

1. Load the trace code and batch relationship.
2. Return immediately for a frozen code.
3. Load field coordinates, owner/agent, events, credentials, and optional map configuration with independent or parallel read queries.
4. Atomically increment `scanCount` with a single update.
5. Attempt the trace-scan insert separately; an insert failure is logged but cannot roll back the counter or public response.

This removes the current ineffective catch-inside-a-PostgreSQL-transaction pattern and reduces lock duration on popular trace codes. Per-IP throttling and trusted-proxy IP resolution remain unchanged.

### Scope-query scaling

Owned tables with an `owner` relation will use relational filters for agent scope instead of loading every merchant ID and constructing a growing `IN` array. `ScopeService` will provide typed filters for owner-backed entities and retain explicit ID resolution only for models that cannot express the relationship. Existing fail-closed behavior for missing ownership identifiers remains mandatory.

### Health and request logging

The backend will add:

- `GET /api/health/live`: public, does not query the database, returns status, process uptime, and application version.
- `GET /api/health/ready`: public and throttled, executes `SELECT 1`, returns `200` when ready and `503` when the database is unavailable.

A global request interceptor will emit one JSON log record per request containing request ID, method, normalized path, status, duration, and authenticated tenant/user IDs when available. It will not log authorization headers, cookies, request bodies, query secrets, AI content, or integration credentials. An incoming request ID is accepted only when it satisfies a conservative length/character check; otherwise a UUID is generated.

Deployment documentation will add Nginx/PM2 health checks, log expectations, and the static security headers introduced in Stage A.

### Frontend decomposition and shared response contracts

`BatchAdmin.tsx` will become a page-level coordinator rather than containing table rendering, create/edit forms, lifecycle display, trace generation, label preview/export, and dialogs in one file. State transitions will move into a focused hook, while table, lifecycle, trace-code, label, and mutation-dialog surfaces become independently tested components.

`DashboardDemo.tsx` will retain its explicit demo-only lazy boundary but split its large visual scenes and data constants into focused modules. Production navigation must continue loading the demo bundle only after explicit user opt-in.

Shared Zod response schemas will be added for the Batch, Field, FarmRecord, TraceCode, and TraceEvent views touched during the split. Web and miniapp API modules will import those inferred types instead of maintaining parallel interfaces. API boundary tests will parse representative backend responses so that shared contracts provide runtime drift detection, not only compile-time aliases.

The decomposition must preserve current copy, accessibility labels, role navigation, submission locking, and bundle chunk isolation. It is not a visual redesign.

## Error Handling and Rollback

- Dependency upgrades are reverted independently if compatibility tests fail; advisory suppression is not an acceptable fallback.
- Miniapp validation fails with a single actionable message naming the invalid variable.
- Web cookie endpoints return the same generic authentication errors as existing endpoints and never echo token contents.
- AI reconciliation never converts an ambiguous in-flight operation into a free released operation.
- Database migrations abort before installing triggers when audits return rows. Existing audit output identifies the offending records.
- Public trace scan-detail failures are logged and isolated from the consumer response.
- Each stage is committed separately and can be reverted without reverting later-stage data migrations out of order.

## Verification Requirements

Stage A is complete only when:

- production audit has zero critical and high findings;
- invalid miniapp production variables fail before compilation;
- valid CI variables build a bundle with no placeholder values;
- backend, web, miniapp, and shared lint/build/unit gates pass;
- web authentication tests prove that no refresh token is written to localStorage.

Stage B is complete only when:

- AI state-transition unit tests cover success, provider failure, confirmation failure, release failure, and recovery;
- migrations deploy against a clean PostGIS database;
- consistency audit returns zero rows;
- all E2E specifications pass;
- direct inconsistent inserts are rejected by named database constraints.

Stage C is complete only when:

- public trace tests prove scan-detail failure does not fail the public response;
- live and ready health behavior is tested;
- structured logs exclude sensitive data;
- agent-scope tests prove equivalent visibility without merchant-ID expansion;
- extracted frontend components retain their existing behavioral tests;
- web and miniapp production builds preserve demo chunk isolation and pass shared response parsing tests.

The final completion gate is a clean Git worktree plus `pnpm verify:production` and `pnpm audit --prod --audit-level high`, both exiting zero against the prepared PostGIS database.
