# Immutable release runbook

## Build once

Release only from a clean commit. The artifact command builds shared, backend, and web once, includes Prisma migrations and the lockfile, and names the archive with the full Git SHA:

```powershell
corepack pnpm@10.33.2 release:artifact -- --output-dir 'D:\nongchang-releases'
```

Retain the archive and external manifest together. Before deployment, verify the archive SHA-256 and every payload hash. Never rebuild between environments.

## Migration preflight and rollout

1. Point `DATABASE_URL` at the target database and run `corepack pnpm@10.33.2 release:preflight`.
2. Refuse deployment when tenant consistency checks or `prisma migrate status` fail.
3. Deploy the exact archive and set `DEPLOYED_GIT_SHA` to its 40-character manifest SHA.
4. Start the new application pool without traffic, wait for `/api/health/ready`, and confirm `/api/health/live` reports the expected SHA.
5. Admit traffic gradually, then run public-trace and authenticated read-only smoke requests:

```powershell
corepack pnpm@10.33.2 release:smoke -- --base-url 'https://api.example.com' --expected-sha '<sha>' --trace-code '<known-code>' --access-token '<short-lived-read-only-token>'
```

Do not put long-lived credentials in command history. Prefer a short-lived, read-only smoke identity supplied by the deployment secret mechanism.

## Application rollback

Rollback selects a previously verified immutable archive and writes the deployment state atomically. The tool refuses Prisma reset, down migration, SQL reversal, and database rollback arguments:

```powershell
corepack pnpm@10.33.2 release:rollback -- --artifact 'D:\releases\nongchang-<sha>.tar.gz' --manifest 'D:\releases\nongchang-<sha>.manifest.json' --state-file 'D:\nongchang\current-release.json'
```

Restart the application pool with `DEPLOYED_GIT_SHA=<previous-sha>`, wait for readiness, run smoke checks, and then restore traffic. If a forward migration is incompatible with the previous application, stop and perform a forward-fix deployment; this workflow never reverses database schema or data automatically.
