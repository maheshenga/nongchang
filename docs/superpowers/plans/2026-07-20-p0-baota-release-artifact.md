# P0 Baota Release Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the tested immutable Web/API release controls into the current remediation branch so a clean Linux x64 artifact can be verified and deployed to Baota without source checkout, on-server rebuilds, or unsafe rollback.

**Architecture:** Keep the current Web/API-first release boundary. Build a target-aware `web` artifact containing compiled backend/Web/shared output, Prisma schema and migrations, portable production dependencies, operational scripts, and an immutable manifest. Validate the archive in an empty release directory, then gate Baota DNS, TLS, capacity, candidate port, and SHA checks before any traffic switch.

**Tech Stack:** Node.js 20, pnpm 10.33.2, NestJS, Prisma, Vite, Node `node:test`, PostGIS, Nginx, PM2.

## Global Constraints

- Do not use the `using-superpowers` skill.
- Release target is explicitly `web`; do not package the miniapp into the Web/API server artifact.
- Artifacts must be built on Linux x64 and named with the full lowercase 40-character Git SHA.
- The production server must not clone source, install dependencies, or rebuild the application.
- Rollback is application-artifact-only and must refuse Prisma reset/down migrations, reverse SQL, DROP, TRUNCATE, and database rollback arguments.
- Credentials, tokens, database URLs, and private keys stay in restricted environment or Baota configuration.
- Every production behavior change starts with a failing regression test.

---

### Task 1: Target-aware portable artifact contract

**Files:**
- Create: `scripts/release/artifact-contract.mjs`
- Modify: `scripts/release/build-artifact.mjs`
- Modify: `scripts/release/build-artifact.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `assertWebReleaseTarget(target): 'web'`
- `assertWebArtifactPayload(paths): void`
- `assertArtifactManifestContract(manifest, expectedGitSha, expectedTarget): object`
- `buildArtifact({ outputDir, target: 'web', skipBuild?: boolean })`

- [ ] **Step 1: Write failing tests** for non-web targets, missing backend/Prisma/runtime dependency entries, miniapp payloads, malformed SHA, and manifest target/schema drift.
- [ ] **Step 2: Run RED:** `node --test scripts/release/build-artifact.test.mjs`. The new assertions must fail against the current schema-1 builder.
- [ ] **Step 3: Implement the portable payload** using `pnpm --filter @nongchang/backend deploy --prod --legacy <temporary-dir>`; keep the Prisma CLI in backend production dependencies; copy backend/Web/shared output, Prisma schema/migrations, generated Prisma client, package manifests, lockfile, and currently available operational scripts; rebase only in-tree dependency links. Task 2 and Task 3 extend the required-entry contract as their verifier and Baota files are created so every intermediate commit remains buildable.
- [ ] **Step 4: Enforce this manifest contract:**

```json
{ "schemaVersion": 2, "target": "web", "gitSha": "<40 lowercase hex>", "files": { "<portable/path>": "<64 hex SHA-256>" } }
```

- [ ] **Step 5: Run GREEN:** `node --test scripts/release/artifact-contract.test.mjs scripts/release/build-artifact.test.mjs`; commit as `fix(release): enforce portable web artifact contract`.

### Task 2: Archive verification and server preflight

**Files:**
- Create: `scripts/release/verify-artifact.mjs`
- Create: `scripts/release/verify-artifact.test.mjs`
- Create: `scripts/release/server-preflight.mjs`
- Create: `scripts/release/server-preflight.test.mjs`
- Modify: `scripts/release/artifact-contract.mjs`
- Modify: `scripts/release/artifact-contract.test.mjs`
- Modify: `scripts/release/migration-preflight.mjs`
- Modify: `package.json`

**Interfaces:**
- `verifyReleaseArtifact({ archive, manifestFile, releaseDir, expectedGitSha, expectedTarget: 'web' })`
- `assertDnsTarget(addresses, targetIp)`
- `assertCertificateNames(names, hostname)`
- `assertCandidatePortAvailability({ port, available })`
- `assertCapacity({ freeDiskBytes, availableMemoryBytes, artifactBytes, backupBytes })`

- [ ] **Step 1: Write failing tests** for archive SHA drift, manifest/payload hash drift, out-of-tree symlinks, DNS mismatch, TLS name/date mismatch, occupied candidate ports, memory below 1 GiB, and disk below 10 GiB.
- [ ] **Step 2: Run RED:** `node --test scripts/release/verify-artifact.test.mjs scripts/release/server-preflight.test.mjs`.
- [ ] **Step 3: Implement full extracted-payload verification** against external and embedded manifests; require candidate API port 3001 or 3002, exact DNS target, valid TLS, artifact SHA alignment, and capacity for artifact plus extracted release plus backup. Extend the artifact contract to require the verifier and preflight files introduced by this task.
- [ ] **Step 4: Add `release:verify-artifact` and `release:server-preflight` scripts; run focused GREEN tests, `git diff --check`, and commit as `feat(release): verify immutable artifacts before Baota deploy`.

### Task 3: Baota rollout wiring and release gate

**Files:**
- Create: `scripts/release/switch-release.mjs`, `scripts/release/switch-release.test.mjs`
- Create: `ops/data-stack/compose.production.yml`, `ops/data-stack/data-stack.env.example`, `ops/pm2/ecosystem.config.cjs`, `ops/nginx/active-api.conf.example`, `ops/nginx/farm.qingyouai.com.conf.template`, `ops/runtime/production.env.example`, `ops/logrotate/nongchang`
- Modify: `scripts/release/artifact-contract.mjs`, `scripts/release/artifact-contract.test.mjs`
- Modify: `.github/workflows/release.yml`, `docs/deploy/baota.md`, `docs/ops/release-runbook.md`, `docs/ops/production-verification.md`

- [ ] **Step 1: Add failing release-gate tests** proving CI invokes release verification, browser/accessibility, query plans, backup restore, audit, release tests, and `release:artifact -- --target web`, with no real secrets. Add rollback tests that reject Prisma reset/down migrations, reverse SQL, DROP, TRUNCATE, and database rollback arguments.
- [ ] **Step 2: Wire the immutable order:** Linux x64 build once, archive plus manifest upload, artifact extraction verification, server preflight, forward-only migration, candidate readiness/SHA smoke, controlled Nginx switch, public smoke, worker health, and atomic application-only rollback state. Extend the artifact contract to require the Baota/runtime files introduced by this task.
- [ ] **Step 3: Run `node --test scripts/release/*.test.mjs` and `git diff --check`; commit as `feat(ops): gate Baota releases on immutable artifacts`.**

### Task 4: P0 artifact build and independent review

- [ ] **Step 1:** On Linux x64 CI, run `pnpm@10.33.2 release:artifact -- --target web --skip-build --output-dir /tmp/nongchang-release`.
- [ ] **Step 2:** Extract into a SHA-named empty directory and run `release:verify-artifact`; confirm backend entry, Prisma schema/migrations, generated client, and Web index work without a source checkout.
- [ ] **Step 3:** Run `node --test scripts/lib/backup-format.test.mjs scripts/release/*.test.mjs`, backend build, Web typecheck, and existing browser runner tests.
- [ ] **Step 4:** Generate a review package, require no Critical/Important findings, and update `.superpowers/sdd/progress.md` with artifact and Linux/Baota evidence.

## P1/P2 follow-up order

After this P0 release slice is independently reviewed, execute separate plans in order: miniapp support/contact and real workflow truthfulness; real dashboard and anti-fake production entry; formal routing/capability registry; API v1/runtime response contracts; audit/operations gates; then billing/search/hotspot decomposition. Do not mix those product changes into this release-artifact commit series.
