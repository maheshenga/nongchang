# P0 Task 2 Report: Immutable Artifact Verification and Server Preflight

## Scope

Implemented the approved Task 2 release boundary only. The changes add immutable archive verification, server-side release preflight checks, the two new executable artifact contract entries, package commands, and an artifact-aware migration status preflight. No Baota operations entries, deployment workflow changes, server access, credentials, or live deployment actions were included.

## RED Evidence

Command:

```powershell
node --test scripts/release/verify-artifact.test.mjs scripts/release/server-preflight.test.mjs
```

Result: exit code 1, 0/6 passed. Every test failed because the Task 2 modules did not exist yet:

- `ERR_MODULE_NOT_FOUND` for `scripts/release/verify-artifact.mjs`
- `ERR_MODULE_NOT_FOUND` for `scripts/release/server-preflight.mjs`

The tests were added before the production implementations. They cover archive SHA drift, external versus embedded manifest drift, extracted payload hash/file-set drift, release-escaping symlinks, exact DNS targeting, TLS name/current-validity checks, candidate ports 3001 and 3002, minimum 1 GiB free memory, minimum 10 GiB disk, and artifact-plus-extraction-plus-backup capacity.

## GREEN Evidence

First focused implementation run exposed a parse error in the new `server-preflight.mjs` argument error template (`Missing } in template expression`). The cause was an unmatched template-expression delimiter. It was corrected as one isolated change, then rerun.

Focused Task 2 suite:

```powershell
node --test scripts/release/artifact-contract.test.mjs scripts/release/build-artifact.test.mjs scripts/release/verify-artifact.test.mjs scripts/release/server-preflight.test.mjs
```

Result: exit code 0, 24/24 passed.

Bounded release-script regression suite:

```powershell
node --test scripts/release/*.test.mjs
```

Result: exit code 0, 30/30 passed.

Syntax and whitespace checks:

```powershell
node --check scripts/release/verify-artifact.mjs
node --check scripts/release/server-preflight.mjs
node --check scripts/release/migration-preflight.mjs
git diff --check
```

Result: all exited 0. Git emitted existing Windows CRLF normalization warnings only; `git diff --check` reported no whitespace error.

## Changed Files

- `scripts/release/verify-artifact.mjs`: validates absolute inputs, expected SHA/release directory alignment, archive SHA-256, external and embedded manifests, exact extracted file set, per-file hashes, Web-only payload, and symlink containment.
- `scripts/release/verify-artifact.test.mjs`: regression coverage for accepted artifact, archive SHA drift, payload hash drift, manifest drift, extra files, and escaping symlinks.
- `scripts/release/server-preflight.mjs`: checks exclusive A records, public CA TLS/SNI, certificate names and validity period, candidate ports 3001/3002, release-manifest SHA/target alignment, memory/disk thresholds, and capacity for archive plus extracted release plus backup.
- `scripts/release/server-preflight.test.mjs`: regression coverage for DNS, TLS, candidate-port, and capacity guards.
- `scripts/release/artifact-contract.mjs`: requires only the Task 2 verifier/preflight executables in addition to the approved Task 1 contract.
- `scripts/release/artifact-contract.test.mjs`: asserts those two required artifact entries.
- `scripts/release/build-artifact.mjs`: supplies one source mapping for each newly required executable, preserving the exact-mapping invariant.
- `scripts/release/migration-preflight.mjs`: selects the artifact-local Prisma CLI/schema when invoked from an extracted release and continues to run only `prisma migrate status`; it accepts `DIRECT_DATABASE_URL` before `DATABASE_URL` without exposing either value.
- `package.json`: adds `release:verify-artifact` and `release:server-preflight` commands.

## Review and Concerns

- No later Baota operations/configuration files were added to `WEB_REQUIRED_ARTIFACT_ENTRIES`; those remain Task 3 work.
- Migration preflight remains forward-only: it performs consistency SQL and `prisma migrate status`, with no `migrate deploy`, `db push`, rollback, or schema-reversal action.
- Live DNS resolution, TLS handshake, disk/memory probing, port probing, archive extraction, and server deployment were intentionally not run. They require the target environment and are outside this no-deploy task. The checked functions and local fixture tests cover the fail-closed behavior.
