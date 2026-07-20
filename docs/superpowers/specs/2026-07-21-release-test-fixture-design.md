# Release Test Fixture Isolation Design

## Problem

The first post-merge `Immutable Web release` run failed before artifact creation because the `production-web` GitHub Environment is empty and the browser E2E fixtures require `E2E_TENANT_CODE`. The release job uses a fresh PostGIS and Redis stack plus the repository demo seed, so these browser credentials are test fixtures, not production runtime configuration.

## Decision

Keep production-facing public configuration environment-backed, but make the release job's isolated test inputs explicit and deterministic:

- Keep `VITE_PUBLIC_SALES_CONTACT` sourced from the `production-web` environment variable.
- Set `E2E_TENANT_CODE`, `E2E_USERNAME`, `E2E_PASSWORD`, and `E2E_BILLING_USERNAME` to the same demo fixture values used by the passing CI browser job.
- Set `BACKUP_ENCRYPTION_KEY` to the existing non-production deterministic test key used by the release workflow before the environment indirection was introduced. This key is only used by the local backup/restore drill in the ephemeral CI database.
- Do not add production database, Redis, JWT, encryption, payment, provider, or server credentials to the workflow.

This keeps the release gate self-contained and prevents a missing production environment secret from blocking tests that run entirely against disposable CI services. Production runtime configuration remains restricted to Baota-managed files as documented in `docs/deploy/baota.md`.

## Alternatives Considered

1. Populate `production-web` with the demo tenant and test credentials. Rejected because it stores disposable test credentials in a production-named environment and couples the release gate to operator configuration.
2. Make browser tests skip when credentials are missing. Rejected because it would let a release pass without exercising authenticated critical flows.
3. Use explicit non-production fixtures in the release workflow while retaining public contact configuration. Selected because it preserves the full gate and matches the already passing CI browser contract.

## Verification

- Add a release workflow contract test asserting the isolated fixture variables are explicit and the production public contact remains environment-backed.
- Run the focused release test suite and the full release workflow from `main`.
- Require the workflow to complete through `release:artifact`, archive verification, tooling bundle creation, and artifact upload before any server action.
- No production server, database, Nginx, PM2, or GitHub production runtime secret is changed by this fix.
