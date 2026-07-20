# Baota Web/API Production Deployment

This guide is the authoritative deployment path for `farm.qingyouai.com`. The release scope is Web/API only. Miniapp output is not part of this artifact or cutover.

The production server consumes the Linux x64 archive and external manifest produced by CI. It must never clone the repository, run `pnpm install`, or build application code. All credentials remain in Baota-managed files or protected GitHub Environment secrets; the repository contains placeholders only.

## Topology and capacity

- Nginx exposes only ports 80 and 443.
- Blue and green APIs bind to `127.0.0.1:3001` and `127.0.0.1:3002`.
- The single operations worker binds to `127.0.0.1:3003` for local health checks only.
- PostGIS, Redis, and PgBouncer bind to `127.0.0.1:5544`, `127.0.0.1:56380`, and `127.0.0.1:56432`.
- The baseline host is 4 cores, 8 GiB RAM, and 60 GiB disk. Keep at least 1 GiB available RAM and 10 GiB free disk before each release.

Install a dedicated Node.js 20 runtime, PM2, Docker Compose v2.23.1 or newer, and Baota Nginx. Create a dedicated deploy user and do not alter unrelated PM2 processes, containers, or sites.

```bash
ROOT=/www/wwwroot/farm.qingyouai.com
install -d -m 0750 "$ROOT"/{incoming,releases,shared,backups}
install -d -m 0750 "$ROOT/shared/logs"
```

Copy `ops/nginx/active-api.conf.example` to `$ROOT/shared/active-api.conf`, install `ops/nginx/farm.qingyouai.com.conf.template` as the site config, and install `ops/logrotate/nongchang` as `/etc/logrotate.d/nongchang`. Validate Nginx before reload.

## Protected configuration

GitHub Environment `production-web` contains the public Vite variable `VITE_PUBLIC_SALES_CONTACT` plus test/backup secret references needed by the CI gates. It must not contain the Baota runtime environment.

On the server, create these mode-0600 files from the artifact examples:

- `$ROOT/shared/production.env` from `ops/runtime/production.env.example`;
- `$ROOT/shared/data-stack.env` from `ops/data-stack/data-stack.env.example`;
- `$ROOT/shared/pgbouncer-userlist.txt` with the application role's SCRAM verifier.

`PUBLIC_SALES_CONTACT` and `PUBLIC_SUPPORT_CONTACT` must be real production contacts. Database, Redis, JWT, encryption, provider, and payment values must never be committed or placed on a command line. Use URL-encoded passwords in `DATABASE_URL` and `DIRECT_DATABASE_URL`.

## Receive the immutable artifact

CI uploads exactly one archive/manifest pair named with the full 40-character commit SHA. Download those two files into `incoming` through an authenticated operator channel; do not download source code.

```bash
SHA='<40-character-lowercase-git-sha>'
ARCHIVE="$ROOT/incoming/nongchang-$SHA.tar.gz"
MANIFEST="$ROOT/incoming/nongchang-$SHA.manifest.json"
RELEASE="$ROOT/releases/$SHA"

test "$(jq -r .gitSha "$MANIFEST")" = "$SHA"
test "$(jq -r .target "$MANIFEST")" = web
test "$(jq -r .archive "$MANIFEST")" = "$(basename "$ARCHIVE")"
echo "$(jq -r .archiveSha256 "$MANIFEST")  $ARCHIVE" | sha256sum --check --strict
test ! -e "$RELEASE"
```

Do not extract into `$RELEASE` manually. `server-preflight.mjs` owns verified extraction and requires that release directory to be absent or empty. For later releases, run preflight from `$ROOT/current`. During first-host provisioning, install a reviewed release-tooling bundle with the same artifact-root layout and production dependency tree under `$ROOT/shared/release-tooling`; this bootstrap bundle may be copied from CI but must not clone, install, or build on the server.

## Data stack, backup, and forward-only migration

Run server preflight first. It inventories archive paths and links before extracting, verifies the external and embedded manifests and every payload hash, checks DNS/TLS, confirms the candidate port is free, and checks disk/RAM capacity.

```bash
set -a
. "$ROOT/shared/production.env"
set +a

TOOL_ROOT="$ROOT/current"
test -f "$TOOL_ROOT/scripts/release/server-preflight.mjs" || TOOL_ROOT="$ROOT/shared/release-tooling"
node "$TOOL_ROOT/scripts/release/server-preflight.mjs" \
  --hostname farm.qingyouai.com \
  --target-ip '<production-ip>' \
  --candidate-port 3001 \
  --archive "$ARCHIVE" \
  --manifest "$MANIFEST" \
  --release-root "$ROOT" \
  --backup-bytes 5368709120 \
  --expected-sha "$SHA" \
  --expected-target web
```

After preflight creates `$RELEASE`, start or validate the isolated data stack. Inline Compose bootstrap configuration creates separate app, migration, and backup roles only for a new volume. Existing volumes require an audited forward SQL change.

```bash
docker compose --env-file "$ROOT/shared/data-stack.env" \
  -f "$RELEASE/ops/data-stack/compose.production.yml" config --quiet
docker compose --env-file "$ROOT/shared/data-stack.env" \
  -f "$RELEASE/ops/data-stack/compose.production.yml" up -d
docker compose --env-file "$ROOT/shared/data-stack.env" \
  -f "$RELEASE/ops/data-stack/compose.production.yml" ps
```

Create an encrypted PostgreSQL backup, verify its checksum, copy it to off-host immutable storage, and confirm the remote checksum. Do not migrate until that confirmation exists.

```bash
DATABASE_URL="$DIRECT_DATABASE_URL" BACKUP_ENCRYPTION_KEY='<runtime-only-key>' \
  node "$RELEASE/scripts/backup-postgres.mjs" --output-dir "$ROOT/backups" --retention 3

node "$RELEASE/scripts/release/migration-preflight.mjs"
DATABASE_URL="$DIRECT_DATABASE_URL" "$RELEASE/node_modules/.bin/prisma" \
  migrate deploy --schema "$RELEASE/prisma/schema.prisma"
```

Only `prisma migrate deploy` is allowed. Reset/down migrations, reverse SQL, `DROP`, `TRUNCATE`, database rollback flags, and automatic data restoration are release blockers.

## Candidate switch and verification

Supply the smoke identity through the environment, never through a long-lived command-line token. The switcher verifies the embedded Web manifest and Node 20, starts the inactive PM2 API, verifies candidate readiness and `deployedGitSha`, writes the active Nginx include and `current` symlink atomically, validates/reloads Nginx, runs public smoke, commits `deploy-state.json`, stops the old API, restarts the worker, and verifies worker health.

```bash
export NONGCHANG_SMOKE_ACCESS_TOKEN='<short-lived-read-only-token>'
node "$RELEASE/scripts/release/switch-release.mjs" \
  --release-root "$ROOT" \
  --candidate-port 3001 \
  --candidate-sha "$SHA" \
  --expected-target web \
  --node-bin /absolute/path/to/node20 \
  --pm2-bin /absolute/path/to/pm2 \
  --nginx-bin /www/server/nginx/sbin/nginx \
  --nginx-conf /www/server/nginx/conf/nginx.conf \
  --hostname farm.qingyouai.com \
  --trace-code '<known-public-trace-code>'
unset NONGCHANG_SMOKE_ACCESS_TOKEN
```

If Nginx validation/reload or public smoke fails, the old include and symlinks are restored and candidate state is not committed. A post-switch worker error is degraded, not success: traffic stays on the already verified API while the operator repairs worker health.

Verify public live/ready SHA, authenticated read-only access, public trace, PM2 process count, worker health, queue backlog, request IDs, TLS, and the off-host backup record before closing the release.

## Application-only rollback

`deploy-state.json` retains the prior immutable application SHA, release directory, and inactive port. Before rollback, prove that the previous application remains compatible with the forward schema. Then run the same switch command with `previousGitSha` and `previousPort`; this gives rollback the same candidate, SHA, Nginx, public smoke, worker, and atomic-state gates as a forward release.

The database is never rolled back by this procedure. If forward schema compatibility cannot be proved, stop and ship a forward-fix. `rollback.mjs` rejects Prisma reset/down, reverse SQL, `DROP`, `TRUNCATE`, and database rollback arguments.
