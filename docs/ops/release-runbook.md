# Immutable Web/API Release Runbook

## Release inputs and stop conditions

Release only a protected tag at a clean 40-character Git SHA. The `production-web` job must pass the Web release build/unit/e2e gate, browser tests, accessibility, query-plan checks, backup restore drill, production dependency audit, release contract tests, and `release:artifact -- --target web`.

The only server inputs are `nongchang-<sha>.tar.gz` and `nongchang-<sha>.manifest.json` built on Linux x64. Stop if either is missing, their SHA/target/hash contract differs, or the archive contains miniapp output. The server never clones, installs, or builds.

Stop before migration or traffic changes when DNS/TLS does not match `farm.qingyouai.com`, the candidate port is occupied, available RAM is below 1 GiB, free disk is below 10 GiB or cannot hold artifact/extraction/backup, the data stack is unhealthy, or the encrypted off-host backup is not verified.

## Ordered release

1. Download the archive and manifest from the CI artifact into `incoming`; verify the external archive name, SHA, target, and archive hash without extracting into `releases/<sha>`.
2. Choose the inactive API port from `deploy-state.json` and run trusted `server-preflight.mjs` with the archive, manifest, expected SHA, and expected target. Preflight inventories paths/links, verifies both manifests, Linux x64 provenance, `target=web`, every payload hash, and owns extraction into the empty `releases/<sha>` directory.
3. Start or validate the artifact-provided isolated data stack.
4. Create an encrypted direct-PostgreSQL backup, verify its checksum, copy it off-host, and verify the remote checksum.
5. Run `migration-preflight.mjs`, then artifact-local `prisma migrate deploy` through `DIRECT_DATABASE_URL`.
6. Load `$ROOT/shared/production.env`; inject only a short-lived read-only smoke token through `NONGCHANG_SMOKE_ACCESS_TOKEN`.
7. Run `switch-release.mjs`. It starts the inactive candidate, verifies readiness and live SHA, stages the Nginx include/current symlink atomically, validates and reloads Nginx, verifies the public route, commits application-only deploy state, stops the old API, restarts and verifies the worker, and prunes only unprotected old application releases.
8. Recheck public live/ready SHA, public trace, authenticated access, PM2 API/worker health, queue backlog, request-ID logging, TLS, and backup evidence.

See [Baota deployment](../deploy/baota.md) for exact commands and paths.

## Failure boundaries

- Before traffic staging: old traffic and deploy state remain unchanged; the failed candidate is removed from PM2.
- Nginx validation/reload or public smoke failure: restore the old active include and current/previous symlinks, reload the old config, and do not commit candidate state.
- Worker restart or worker health failure after public smoke: report degraded; keep the already verified API active and repair the worker immediately.
- Lock file remains after a host/process crash: confirm no release process is active and reconcile `deploy-state.json`, PM2, the Nginx include, and current/previous links before two-person removal.

## Application-only rollback

Confirm that the previous application artifact is compatible with the already-forward schema. Read `previousGitSha`, `previousPort`, and `previousRelease` from `deploy-state.json`; require `previousRelease` to equal `$ROOT/releases/$previousGitSha`. Run the same `switch-release.mjs` path with that SHA and port so rollback receives identical manifest, readiness/SHA, Nginx, public smoke, worker health, locking, and atomic-state checks.

Never pass database flags to rollback tools. `prisma migrate reset`, `migrate down`, reverse SQL, `DROP`, `TRUNCATE`, database restore, or automatic data rollback are forbidden. If the previous artifact cannot run against the forward schema, release a forward-fix.

Record tag, full SHA, manifest SHA-256, backup manifest and off-host checksum, migration summary, switch result, smoke request ID, operator, and timestamp. Never copy environment files, credentials, access tokens, or provider response bodies into the ticket.
