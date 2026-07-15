# Baota Production Launch P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan inline with test-driven-development. Subagents are prohibited for this task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Baota production runtime and immutable release controls so Nongchang can be deployed without reusing or disrupting existing server workloads.

**Architecture:** Keep Baota Nginx as the public entry point, run one active PM2 API plus one worker, and use a loopback-only blue/green candidate port during releases. Run dedicated PostGIS, authenticated Redis, and PgBouncer services in a version-pinned Compose stack. Build one Linux x64 artifact containing every runtime input and switch traffic only after manifest, readiness, SHA, and smoke checks pass.

**Tech Stack:** Node.js 20, pnpm 10.33.2, NestJS, Prisma, PM2, Docker Compose, Nginx, PostgreSQL/PostGIS, Redis, PgBouncer.

**Execution status (2026-07-15):** Tasks 1-6 are implemented and reviewed. Fresh local production, browser (22/22), accessibility (13/13), release-control (47/47), query-plan, Compose, YAML, secret-scan, and encrypted backup/restore gates pass. The review also fixed pnpm Prisma client discovery, removed `CREATEDB` from the migration role, bounded a database-heavy e2e test, and made the browser backend port configurable without changing its CI default. The real immutable archive assembly remains intentionally Linux x64-only and must pass the tag release workflow before server deployment. Public DNS now resolves to the target IP, but live TLS still presents the unrelated `fcy.qingyouai.com` certificate, so production switch remains fail-closed until a matching `farm.qingyouai.com` certificate is installed.

## Global Constraints

- Production hostname is `farm.qingyouai.com`; DNS propagation is an explicit preflight, not a code assumption.
- All application and data ports bind to `127.0.0.1`; only Nginx exposes ports 80 and 443.
- Existing server PM2 applications, containers, databases, Redis, Nginx sites, and certificates are not modified by repository tests.
- Runtime secrets remain outside release archives and are never printed.
- Database migrations are forward-only; rollback never reverses schema changes.
- Every behavior change follows red-green-refactor and the full production verification gate remains authoritative.

---

### Task 1: Restore the canonical release gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/ops/production-verification.md`
- Test: `packages/web/src/config/production-env.spec.ts`
- Test: `packages/miniapp/config/production-env.spec.ts`

**Interfaces:**
- Consumes: `VITE_PUBLIC_SALES_CONTACT`, `TARO_APP_SUPPORT_CONTACT` production validators.
- Produces: one CI/release environment contract that can run `verify:production` without bypassing validators.

- [x] Add safe non-secret CI values for both required contacts.
- [x] Run the Web and miniapp production validators to reproduce the previous failure and confirm the workflow values satisfy them.
- [x] Update the documented production verification environment so local, CI, and tag release commands use the same four public build values.
- [x] Run focused validator tests and both production builds.

### Task 2: Enforce loopback-only runtime binding

**Files:**
- Create: `packages/backend/src/common/network/listen-host.ts`
- Create: `packages/backend/src/common/network/listen-host.spec.ts`
- Modify: `packages/backend/src/main.ts`
- Modify: `packages/backend/src/common/config/validate-env.ts`
- Modify: `packages/backend/src/common/config/validate-env.spec.ts`

**Interfaces:**
- Produces: `readListenHost(env: NodeJS.ProcessEnv): '127.0.0.1'`.
- Consumes: optional `HOST`; production accepts only `127.0.0.1`, while non-production defaults to loopback.

- [x] Write failing tests for default loopback, explicit loopback, wildcard rejection, and production hostname rejection.
- [x] Run the focused tests and confirm they fail because `readListenHost` does not exist.
- [x] Implement the parser and call it from both startup validation and `app.listen`.
- [x] Run focused backend tests and build.

### Task 3: Build a complete immutable runtime artifact

**Files:**
- Modify: `scripts/release/build-artifact.mjs`
- Modify: `scripts/release/build-artifact.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: artifact directories `backend`, `web`, `miniapp`, `shared`, `prisma`, `node_modules`, `packages`, and `ops` plus a complete hash manifest.
- Consumes: clean tagged checkout, generated Prisma client, compiled outputs, and pnpm production deployment.

- [x] Write failing tests for the required payload paths and missing-path rejection.
- [x] Add a pure `requiredArtifactEntries()` contract and verify all required entries before archiving.
- [x] Build Web and miniapp in addition to shared/backend, generate a Linux production dependency deployment with `pnpm deploy`, and include Prisma schema/client/engine, package manifests, operational templates, and the miniapp output.
- [x] Keep the manifest file-set equality check and full SHA-256 coverage.
- [ ] Run release unit tests and a real artifact build outside the repository.

### Task 4: Add versioned production runtime templates

**Files:**
- Create: `ops/data-stack/compose.production.yml`
- Create: `ops/data-stack/data-stack.env.example`
- Create: `ops/pm2/ecosystem.config.cjs`
- Create: `ops/nginx/farm.qingyouai.com.conf.template`
- Create: `ops/nginx/active-api.conf.example`
- Create: `ops/runtime/production.env.example`
- Create: `scripts/release/production-ops.test.mjs`

**Interfaces:**
- Produces: blue `3001`, green `3002`, worker `3003`, PostGIS `5544`, Redis `56380`, and PgBouncer `56432` loopback contracts.
- Consumes: secret environment files under the server `shared` directory.

- [x] Write a failing structural test that parses all templates and checks ports, loopback bindings, pinned images, health checks, resource/log limits, metrics denial, and PM2 worker separation.
- [x] Add the dedicated Compose stack with authenticated Redis and PgBouncer transaction pooling.
- [x] Add PM2 blue/green/worker definitions with explicit Node 20 interpreter, memory ceilings, graceful shutdown, and worker flags.
- [x] Add Nginx HTTPS, same-origin API, SPA fallback, request ID, upload/time limits, metrics denial, and active-upstream include templates.
- [x] Add safe environment templates containing names only, never credentials.
- [x] Run the structural test and `docker compose config` with generated non-secret validation values.

### Task 5: Add fail-closed server preflight and atomic switch controls

**Files:**
- Create: `scripts/release/server-preflight.mjs`
- Create: `scripts/release/server-preflight.test.mjs`
- Create: `scripts/release/deploy-state.mjs`
- Create: `scripts/release/deploy-state.test.mjs`
- Create: `scripts/release/render-nginx.mjs`
- Create: `scripts/release/render-nginx.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: capacity/DNS/TLS/port checks, immutable deploy-state transitions, and atomic Nginx active-port rendering.
- Consumes: release root, expected SHA, hostname, target IP, candidate port, minimum disk/memory thresholds, and existing manifest.

- [x] Write failing tests for reserved/private DNS results, certificate hostname mismatch, occupied candidate ports, inadequate capacity, invalid SHA/state transitions, and non-loopback upstreams.
- [x] Implement pure validators before CLI orchestration.
- [x] Implement preflight without logging secrets and require the domain to resolve to the configured target IP.
- [x] Implement atomic state and Nginx include writes using same-directory temporary files and rename.
- [x] Add package scripts and run all release tests.

### Task 6: Align the Baota runbook with the approved architecture

**Files:**
- Modify: `docs/deploy/baota.md`
- Modify: `docs/ops/release-runbook.md`
- Modify: `docs/ops/disaster-recovery.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: exact first-launch, release, rollback, backup, DNS/TLS, provider, and tenant-readiness procedures.

- [x] Replace host PostgreSQL/single-PM2 instructions with the dedicated data stack and blue/green layout.
- [x] Document certificate issuance only after DNS resolves to `47.103.96.48` and require a matching SAN before switch.
- [x] Document root-password rotation, SSH hardening, secret generation, off-host backups, restore drill, and alert delivery.
- [x] Document the ten tenant-readiness checks and the real-device/provider acceptance checklist.
- [x] Run documentation/config consistency searches for obsolete ports and host database guidance.

### Task 7: Production verification and review

**Files:**
- Review all files changed by Tasks 1-6.

- [x] Run focused release, host, Web environment, and miniapp environment tests.
- [x] Run `corepack pnpm@10.33.2 verify:production` against fresh local PostGIS/Redis.
- [x] Run `corepack pnpm@10.33.2 test:browser` and `test:accessibility`.
- [ ] Build and inspect the real release artifact and manifest outside the repository.
- [x] Review the diff against every requirement in the approved P0 design.
- [x] Commit only after all verification evidence is current and the worktree contains no unrelated changes.
