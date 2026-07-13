# Baota Production Launch P0 Design

## Objective

Prepare Nongchang for a controlled first production launch on the existing Baota server behind `farm.qingyouai.com`, without disturbing the other PM2, Docker, Nginx, PostgreSQL, Redis, or website workloads already running on that host.

This design covers the P0 production-runtime and release controls only. Miniapp privacy/legal content, account lifecycle compliance, capacity testing, administrator MFA, and broader product hardening remain separate follow-up workstreams.

## Confirmed Environment

The target is one Alibaba Cloud Linux 3 server managed through Baota with:

- 4 CPU cores;
- 7.3 GiB usable memory, approximately 5 GiB available during inspection;
- a 69 GiB root filesystem, approximately 37 GiB available during inspection;
- no swap configured;
- Baota Nginx, PM2, Docker, and Docker Compose already installed;
- Node.js 24 installed globally, while the repository and CI release baseline use Node.js 20;
- four existing PM2 applications and three existing Docker containers;
- a host PostgreSQL 18 instance without an available PostGIS extension;
- a host Redis 8 instance that accepts local connections without authentication;
- existing production websites and databases that must not be restarted, reconfigured, or reused by Nongchang.

`farm.qingyouai.com` is the approved production hostname. DNS did not resolve during inspection, so its A record and TLS certificate are explicit launch prerequisites.

## Chosen Architecture

### Application layer

Baota Nginx remains the public entry point. It serves the built Web application and proxies `/api` to a PM2-managed NestJS API. The production Web application and API remain same-origin so the Web refresh cookie is only used through the intended `/api/auth/web` path.

Only one API process is permanently active. Releases temporarily start a candidate API on the inactive port:

- blue port: `127.0.0.1:3001`;
- green port: `127.0.0.1:3002`.

Nginx points to exactly one of these ports through a generated upstream include. The candidate receives traffic only after readiness, SHA, and smoke verification succeed. The old process drains and stops after the Nginx switch.

BullMQ operations run in one separate PM2 worker runtime on `127.0.0.1:3003`. For P0 it uses the same compiled NestJS entrypoint, but Nginx never proxies this port. API processes use `OPERATIONS_WORKERS_ENABLED=false`; the worker runtime uses `OPERATIONS_WORKERS_ENABLED=true`. This keeps the existing operations-module wiring and gives Prometheus a local worker health and metrics endpoint without adding a second bootstrap architecture. A candidate API never starts a second worker. After the API and Web switch succeeds, the worker runtime is restarted from the new release.

All three PM2 runtimes receive an explicit `HOST=127.0.0.1`. Implementation adds fail-closed host parsing because the current backend entrypoint listens on `0.0.0.0` unconditionally.

Nongchang uses a dedicated Node.js 20 interpreter. The global Node.js 24 installation and the existing PM2 applications are not modified.

### Data layer

The host PostgreSQL and Redis instances are not reused. Nongchang receives a dedicated Docker Compose data stack on the same server:

- PostGIS 16 with a persistent volume, bound to `127.0.0.1:5544`;
- Redis 7.4 with authentication, a persistent volume, and a bounded memory policy, bound to `127.0.0.1:56380`;
- PgBouncer in transaction-pooling mode, bound to `127.0.0.1:56432`.

The API and worker connect through PgBouncer. Migration, backup, restore, and administrative commands connect directly to PostGIS, not through transaction pooling. Container names, volumes, networks, ports, and credentials are Nongchang-specific and cannot collide with the existing `new-api` stack.

The data stack is version-pinned. It does not use floating `latest` tags. Compose health checks cover PostgreSQL, Redis, and PgBouncer. Initial container limits are 1.5 GiB and 1.5 CPUs for PostGIS, 384 MiB and 0.5 CPU for Redis, and 128 MiB and 0.25 CPU for PgBouncer. Docker JSON logs use `max-size=20m` and `max-file=5`.

### Monitoring layer

The existing Prometheus configuration is deployed in a lightweight local profile capped at 256 MiB, 0.25 CPU, and three days of local retention. A full Grafana/Loki stack is not part of P0.

`/api/metrics` is not public. Nginx denies external access and permits the local scraper. Prometheus scrapes the active API and the worker runtime separately. The application also requires a production metrics bearer token so an accidental proxy change does not silently expose metrics.

External monitoring checks the HTTPS liveness and readiness endpoints. Alerts cover readiness, HTTP failures, latency, database pool pressure, Redis availability, queue backlog, reconciliation failures, backup age, disk usage, and process restarts.

## Release Layout

The server layout is:

```text
/www/wwwroot/farm.qingyouai.com/
  releases/<40-character-git-sha>/
  shared/production.env
  shared/data-stack.env
  current -> releases/<active-sha>
  previous -> releases/<previous-sha>
  deploy-state.json
```

The environment files are outside release archives, owned by root, readable only by the deployment account and runtime process, and never printed by deployment commands. The deployment account may use narrowly scoped `sudo` commands for Nginx validation/reload and PM2 lifecycle operations; routine deployment does not require interactive root password login.

CI builds shared, backend, Web, and miniapp outputs once from a clean tagged commit. The immutable Linux x64 artifact includes the production dependency tree, generated Prisma client and engine, lockfile, production package manifests, Prisma schema and migrations, compiled backend, built Web assets, versioned operational templates, and a manifest containing the complete Git SHA and file hashes.

The server never rebuilds the application and never resolves dependencies from the public registry during deployment. It verifies the complete artifact manifest and starts the compiled entrypoint with the dedicated Node.js 20 interpreter.

## Deployment Flow

1. Require a clean tagged commit whose protected CI checks are green.
2. Download the immutable artifact and external manifest.
3. Verify archive SHA-256 and every manifest payload hash.
4. Check free disk, memory, Docker data-service health, and availability of the inactive API port.
5. Create an encrypted PostgreSQL backup outside the release directory.
6. Verify the backup checksum and copy the encrypted set to off-host storage before schema changes.
7. Run tenant consistency checks, `prisma migrate status`, and the release migration preflight against direct PostGIS.
8. Extract the release into `releases/<sha>` without changing `current`.
9. Run `prisma migrate deploy` against direct PostGIS.
10. Start the candidate API on the inactive port with `DEPLOYED_GIT_SHA=<sha>` and workers disabled.
11. Wait with bounded retries for candidate readiness and verify the live endpoint reports the expected SHA.
12. Run public-trace and authenticated read-only smoke checks against the candidate port.
13. Generate the Nginx upstream include and Web root for the candidate release.
14. Require `nginx -t` to pass, atomically switch the active include and `current` symlink, then reload Nginx.
15. Run the same smoke checks through `https://farm.qingyouai.com`.
16. Gracefully stop the old API after the public smoke passes.
17. Restart the single worker from the new release and verify its process health and queue metrics.
18. Write `deploy-state.json` atomically and retain the current, previous, and one known-stable release.

No release command logs secrets, database URLs, cookies, bearer tokens, provider payloads, or environment-file contents.

## Failure And Rollback Rules

- Artifact, capacity, data-stack, backup, preflight, migration, candidate readiness, SHA, or candidate smoke failure stops before traffic switching.
- Nginx configuration failure leaves the previous upstream and Web root active.
- A public smoke failure after switching moves Nginx and `current` back to the previous release only when the previous application is compatible with the forward schema.
- Database migrations are never automatically reversed. Incompatible schema changes require a forward-fix release.
- Candidate processes that fail are deleted without touching the active API.
- A worker restart failure does not mark the deployment successful. The API can remain available, but the release remains degraded and queue-backlog alerts must fire.
- Deployment cleanup never removes the active, previous, or known-stable release.
- Backup cleanup never deletes the last verified off-host backup.

## Security Controls

### Network exposure

Only ports 80 and 443 are public application ports. SSH and the Baota panel must be restricted by Alibaba Cloud security groups to approved administrator addresses. Existing FTP, RPC, MySQL, and panel exposure must be reviewed and restricted without disrupting their owners.

PostGIS, Redis, PgBouncer, candidate API ports, and monitoring endpoints bind only to loopback or a private Docker network. Docker does not publish database ports on `0.0.0.0`.

### Authentication and secrets

- Rotate the root password that was disclosed during planning.
- Disable root password authentication after confirming public-key and emergency-console access.
- Generate distinct strong secrets for PostgreSQL, Redis, JWT access, JWT refresh, application encryption, metrics, backup encryption, and external providers.
- Store runtime and data-stack secrets outside the repository with mode `600`.
- Use a dedicated PostgreSQL application user and a separate migration/backup role.
- Set `NODE_ENV=production`, `RUNTIME_STATE_DRIVER=redis`, `ALLOW_MANUAL_PAY=false`, `TRUST_PROXY_HOPS=1`, and the exact release SHA.

### HTTP boundary

The Nginx configuration includes HTTPS redirection, HSTS, CSP, frame denial, MIME sniffing protection, referrer policy, upload-size bounds, request timeouts, Web same-origin fallback, `/api` proxy headers, request-ID propagation, explicit `/api/metrics` denial, and correct forwarding of readiness `503` responses.

## Resource And Retention Policy

The host receives a 2-GiB swap file as an OOM safety buffer. Swap is not treated as normal capacity.

PM2 restarts an API process above 768 MiB and the worker above 512 MiB. PostgreSQL connection counts are bounded through PgBouncer and Prisma pool settings. Redis uses `maxmemory 256mb` with `maxmemory-policy noeviction`; memory exhaustion fails writes and triggers alerts instead of evicting BullMQ jobs or coordination state.

PM2 rotates at 20 MiB per file with seven retained files. Nginx rotates daily with fourteen days retained. Docker uses the limits defined above. The server retains three verified encrypted database backup sets and three application releases. Off-host storage retains at least fourteen daily encrypted backup sets. Encrypted backups are copied to OSS or another host; the local filesystem is not the only recovery location.

The deployment preflight refuses to proceed when free disk is below 10 GiB, when free space cannot hold the new artifact plus one new backup plus another copy of the extracted release, or when the off-host backup destination cannot accept a new backup.

## Verification Gates

### Repository and CI

The protected release gate must run:

```powershell
corepack pnpm@10.33.2 verify:production
corepack pnpm@10.33.2 test:browser
corepack pnpm@10.33.2 test:accessibility
corepack pnpm@10.33.2 --filter @nongchang/backend db:query-plans
corepack pnpm@10.33.2 backup:verify-restore -- --output-dir "$env:TEMP\nongchang-release-backup-drill"
corepack pnpm@10.33.2 audit:prod
node --test scripts/lib/backup-format.test.mjs scripts/release/*.test.mjs
```

The release workflow and documentation use the same command source so they cannot drift independently.

### Server preflight

Before the first production switch, verify:

- DNS A record resolves `farm.qingyouai.com` to the target server;
- a valid TLS certificate is installed and renews automatically;
- only intended public ports are reachable;
- PostGIS reports ready and exposes the required extension;
- Redis requires authentication and is isolated from existing Redis workloads;
- PgBouncer transaction pooling is healthy;
- Node.js 20 and pnpm 10.33.2 are used for Nongchang;
- a backup can be encrypted, copied off-host, restored into a disposable database, and audited;
- Nginx, PM2, Docker, and log rotation configurations validate successfully.

### Release acceptance

The first release is accepted only after:

- the live endpoint reports the exact artifact SHA;
- readiness is stable through the public HTTPS route;
- request IDs are preserved from Nginx to structured application logs;
- login, silent refresh, role navigation, field, batch, farm-record, trace, and billing read paths pass;
- a controlled worker job completes and queue metrics return to baseline;
- database, Redis, queue, disk, process, and backup alerts are delivered to the configured operator;
- an application rollback rehearsal succeeds without reversing database migrations.

## Repository Deliverables

Implementation will add versioned, testable artifacts for:

- a production data-stack Compose file and safe environment template;
- a PM2 ecosystem configuration for blue API, green API, and the single worker;
- fail-closed backend `HOST` validation so every Nongchang runtime binds only to loopback;
- Nginx site and active-upstream templates for `farm.qingyouai.com`;
- deploy, preflight, health-wait, switch, retention, and server-smoke commands;
- fail-closed production metrics configuration;
- a reusable CI release gate used by both pull-request and tag workflows;
- updated Baota, release, backup, rollback, DNS, TLS, and first-launch documentation;
- automated tests for configuration rendering, deployment state transitions, validation failures, and rollback refusal boundaries.

## Out Of Scope

This P0 does not:

- change or restart existing server applications during repository implementation;
- deploy to the server before the versioned artifacts pass review and verification;
- migrate existing server databases or Redis keys into Nongchang;
- add Kubernetes or make the entire application container-based;
- implement miniapp privacy-policy pages, account deletion/export, load testing, MFA, or analytics;
- automate reverse database migrations;
- store production credentials, server passwords, or private keys in Git.
