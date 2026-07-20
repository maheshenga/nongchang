# Release Test Fixture Isolation Implementation Plan

> **For agentic workers:** Execute this plan inline in the current isolated worktree. Each task uses test-first verification and ends at a reviewable boundary.

**Goal:** Make the immutable Web release workflow self-contained for disposable browser E2E and backup/restore checks while keeping public production configuration environment-backed.

**Architecture:** The `build-once` job already creates ephemeral PostGIS and Redis services, then runs the repository demo seed. Its browser inputs must therefore be compared against the ordinary CI browser job, not sourced from a production-named GitHub Environment. A release contract test parses both workflow files to prevent future drift; the workflow retains `VITE_PUBLIC_SALES_CONTACT` as an environment variable.

**Tech Stack:** GitHub Actions YAML, Node.js built-in test runner, `yaml` parser, pnpm.

## Global Constraints

- Keep `environment: production-web` for release governance.
- Keep `VITE_PUBLIC_SALES_CONTACT` sourced from `vars.VITE_PUBLIC_SALES_CONTACT`.
- Do not add production server, database, Redis, JWT, provider, payment, or runtime credentials to source control.
- Reuse the existing non-production fixture values from the CI browser job; do not introduce new fixture identities.
- Do not change artifact target, archive, tooling-bundle, upload, or Baota server behavior.

---

### Task 1: Lock the release fixture contract with a failing test

**Files:**
- Modify: `scripts/release/artifact-contract.test.mjs:111-156`
- Read: `.github/workflows/ci.yml`
- Read: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `parseYaml` already imported by `artifact-contract.test.mjs`.
- Produces: a regression test that reads `jobs.browser.env` from `ci.yml` and `jobs['build-once'].env` from `release.yml`.

- [ ] **Step 1: Add the failing regression assertions**

  In the existing `tag release gates the immutable Web artifact without committed production credentials` test, read and parse `.github/workflows/ci.yml` alongside the release workflow. Add assertions that each of `E2E_TENANT_CODE`, `E2E_USERNAME`, `E2E_PASSWORD`, and `E2E_BILLING_USERNAME` in the release job equals the corresponding `jobs.browser.env` value in CI. Assert that `BACKUP_ENCRYPTION_KEY` is a 64-character lowercase hexadecimal non-production test key, and retain the existing assertion that `VITE_PUBLIC_SALES_CONTACT` comes from `vars.VITE_PUBLIC_SALES_CONTACT`.

  ```js
  const ciWorkflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const ciBrowserEnv = parseYaml(ciWorkflow).jobs.browser.env;
  const releaseEnv = parsedWorkflow.jobs['build-once'].env;

  for (const name of ['E2E_TENANT_CODE', 'E2E_USERNAME', 'E2E_PASSWORD', 'E2E_BILLING_USERNAME']) {
    assert.equal(releaseEnv[name], ciBrowserEnv[name]);
  }
  assert.match(releaseEnv.BACKUP_ENCRYPTION_KEY, /^[0-9a-f]{64}$/);
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `pnpm.cmd exec node --test --test-name-pattern "tag release gates" scripts/release/artifact-contract.test.mjs`

  Expected: failure because the current release job reads the E2E values and backup key from `vars`/`secrets` instead of matching the CI browser fixture environment.

- [ ] **Step 3: Commit the test-only change**

  Run:

  ```powershell
  git add scripts/release/artifact-contract.test.mjs
  git commit -m "test(release): lock isolated browser fixture contract"
  ```

### Task 2: Restore isolated release fixtures without changing production config

**Files:**
- Modify: `.github/workflows/release.yml:36-49`
- Test: `scripts/release/artifact-contract.test.mjs`

**Interfaces:**
- Consumes: the release contract assertions from Task 1 and the existing `ci.yml` browser fixture values.
- Produces: a `build-once.env` block whose browser credentials match `ci.yml`, whose backup key is an explicit non-production test key, and whose public sales contact remains a `production-web` variable.

- [ ] **Step 1: Replace only the isolated test environment entries**

  In `.github/workflows/release.yml`, replace the five `E2E_*`/`BACKUP_ENCRYPTION_KEY` GitHub Environment references with the already existing CI browser fixture values and existing deterministic non-production backup test key. Leave `VITE_PUBLIC_SALES_CONTACT: ${{ vars.VITE_PUBLIC_SALES_CONTACT }}` and `environment: production-web` unchanged. Do not modify any workflow step or service configuration.

- [ ] **Step 2: Run the focused contract test and verify GREEN**

  Run: `pnpm.cmd exec node --test --test-name-pattern "tag release gates" scripts/release/artifact-contract.test.mjs`

  Expected: PASS; the release workflow matches CI browser fixtures, preserves the public contact variable, and still contains no committed production credential material.

- [ ] **Step 3: Run the complete release contract suite**

  Run: `pnpm.cmd release:test`

  Expected: all non-skipped release tests pass with no failures.

- [ ] **Step 4: Commit the workflow correction**

  Run:

  ```powershell
  git add .github/workflows/release.yml scripts/release/artifact-contract.test.mjs
  git commit -m "fix(release): isolate browser test fixtures"
  ```

### Task 3: Review and run the immutable artifact gate

**Files:**
- Review: `.github/workflows/release.yml`
- Review: `scripts/release/artifact-contract.test.mjs`
- Review: `docs/superpowers/specs/2026-07-21-release-test-fixture-design.md`

**Interfaces:**
- Consumes: the committed Task 1 and Task 2 changes.
- Produces: a reviewed branch ready for a PR and a successful GitHub `Immutable Web release` run after merge.

- [ ] **Step 1: Inspect the final diff for scope**

  Run: `git diff origin/main...HEAD -- .github/workflows/release.yml scripts/release/artifact-contract.test.mjs docs/superpowers/specs/2026-07-21-release-test-fixture-design.md docs/superpowers/plans/2026-07-21-release-test-fixture-isolation.md`

  Expected: only workflow fixture values, their regression coverage, and the approved design and implementation documents differ from `main`.

- [ ] **Step 2: Push the branch and open a PR**

  Run with the established GitHub resolver override when needed:

  ```powershell
  git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:20.27.177.113 push -u origin codex/release-test-fixture-env
  ```

  Expected: GitHub CI runs against the small correction before merge.

- [ ] **Step 3: After merge, manually dispatch `Immutable Web release` from `main`**

  Expected: it completes browser tests, accessibility tests, backup/restore drill, release tests, target-aware artifact creation, archive verification, tooling bundle creation, and artifact upload.

- [ ] **Step 4: Stop before production server actions**

  Expected: report the artifact SHA and retain explicit user approval for server preflight, off-host backup confirmation, migration, switch, and live smoke.
