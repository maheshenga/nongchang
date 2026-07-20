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

## Review Fix Follow-up

### RED Evidence

Command:

```powershell
node --test scripts/release/artifact-contract.test.mjs scripts/release/build-artifact.test.mjs scripts/release/migration-preflight.test.mjs scripts/release/verify-artifact.test.mjs scripts/release/server-preflight.test.mjs
```

Result: exit code 1, 20/28 passed and 8 failed before the fixes. The failures proved the review findings: missing Linux/x64 provenance enforcement, missing migration URL helper, capacity still using the two-artifact estimate, server preflight not binding archive/manifest/releaseDir, and verification reading an empty unrelated directory instead of extracting the real tar.gz. The new real-tar fixture was intentionally rejected by the old verifier because no extracted manifest existed.

### GREEN Evidence

Focused follow-up command:

```powershell
node --test scripts/release/artifact-contract.test.mjs scripts/release/build-artifact.test.mjs scripts/release/migration-preflight.test.mjs scripts/release/verify-artifact.test.mjs scripts/release/server-preflight.test.mjs
```

Result: exit code 0, 30/30 passed. This includes real tar.gz extraction, rejection of a pre-populated unrelated SHA directory, archive payload/hash/embedded-manifest/file-set/symlink failures, order-insensitive file maps, candidate preflight artifact binding, A+AAAA resolution, measured release-byte capacity, immutable names, provenance, artifact-local Prisma/schema selection, and `DIRECT_DATABASE_URL` precedence.

### Review Fix Changes

- `verifyReleaseArtifact` now validates exact immutable archive/manifest names, validates the external archive digest and manifest provenance, requires an empty SHA-named release directory, lists and rejects unsafe tar entry paths before extraction, extracts that exact archive, validates extracted external/embedded manifest maps order-independently, validates the exact payload and symlink containment, and returns measured archive/release bytes.
- `runServerPreflight` invokes that full verifier before DNS/TLS/port/capacity work. The CLI derives the SHA-named release directory from `--release-root`; programmatic callers may provide it directly.
- Capacity now reserves `archiveBytes + releaseBytes + backupBytes`, in addition to 1 GiB available memory and 10 GiB free disk minima.
- DNS resolves A and AAAA records; any address other than the configured target fails closed.
- Artifact manifests require `{ platform: 'linux', arch: 'x64' }`, and builder/verifier share exact full-SHA archive/manifest naming helpers.
- Migration preflight gained task-scoped tests for artifact-local Prisma/schema selection and direct connection precedence. It remains status-only and forward-only.

### Follow-up Concerns

- Tests use the host `tar` executable to create and inspect genuine `.tar.gz` fixtures, matching the builder's existing `tar` dependency. No production archive or server was accessed.
- Live DNS/TLS/port/capacity probing and deployment remain intentionally out of scope and unexecuted.

### Final Follow-up Verification

```powershell
node --test scripts/release/*.test.mjs
node --check scripts/release/artifact-contract.mjs
node --check scripts/release/build-artifact.mjs
node --check scripts/release/verify-artifact.mjs
node --check scripts/release/server-preflight.mjs
node --check scripts/release/migration-preflight.mjs
git diff --check
```

Result: all commands exited 0. The bounded release suite passed 37/37. The only output outside test results was the pre-existing Windows CRLF normalization warning from Git.

## Second Review Follow-up

### RED Evidence

Command:

```powershell
node --test scripts/release/build-artifact.test.mjs scripts/release/verify-artifact.test.mjs
```

Result: exit code 1, 20/23 passed. The expected failures showed that the verifier still used CLI tar parsing/extraction, ignored a pre-extraction callback, and had no backend production dependency for a structured archive reader. The raw malicious tar.gz fixture contained an escaping symlink followed by a write under that link; the old CLI reached the linked member before failing.

### GREEN Evidence

Focused command:

```powershell
node --test scripts/release/build-artifact.test.mjs scripts/release/verify-artifact.test.mjs
```

Result: exit code 0, 23/23 passed. The regression creates a genuine gzip-compressed tar archive with an escaping link and a subsequent member under it. Verification rejects from structured metadata inspection before release-directory creation or extraction; the outside sentinel remains `unchanged`.

### Second Review Fixes

- Added maintained `tar` `7.5.20` to `@nongchang/backend` production dependencies and updated `pnpm-lock.yaml`. The release artifact's backend production deployment now carries the parser required by release scripts.
- Replaced human-readable CLI listing/extraction in `verify-artifact.mjs` with structured `tar.t` inspection and `tar.x` extraction. Before any release-directory write/extraction, every member path and symbolic/hard link target is checked as a portable release-relative path.
- Added archive inventory accounting with a 4 KiB per-entry filesystem-overhead reserve. `runServerPreflight` supplies a verifier pre-extraction callback that checks memory/disk capacity using `archiveBytes + estimatedReleaseBytes + backupBytes`; after extraction it rechecks against the measured release bytes.
- Added regression coverage for hard-link traversal, structured-tar production dependency, the pre-extraction callback, and the outside-sentinel malicious archive.

### Second Review Concerns

- The bounded tests create only temporary local fixture archives and never access a production artifact, DNS endpoint, TLS endpoint, or server.

### Final Second Review Verification

```powershell
node --test scripts/release/*.test.mjs
node --check scripts/release/artifact-contract.mjs
node --check scripts/release/build-artifact.mjs
node --check scripts/release/verify-artifact.mjs
node --check scripts/release/server-preflight.mjs
node --check scripts/release/migration-preflight.mjs
git diff --check
```

Result: all commands exited 0; the bounded release suite passed 40/40. Git emitted only the pre-existing Windows CRLF normalization warning.
