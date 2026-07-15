import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production data stack is isolated, authenticated, bounded, and health checked', async () => {
  const compose = await read('ops/data-stack/compose.production.yml');
  const roles = await read('ops/postgres/init-roles.sh');
  for (const binding of ['127.0.0.1:5544:5432', '127.0.0.1:56380:6379', '127.0.0.1:56432:6432']) {
    assert.match(compose, new RegExp(binding.replaceAll('.', '\\.')));
  }
  assert.doesNotMatch(compose, /image:\s*\S+:latest\b/);
  assert.match(compose, /--requirepass/);
  assert.match(compose, /--maxmemory-policy\s+noeviction/);
  assert.match(compose, /healthcheck:/g);
  assert.match(compose, /mem_limit:/g);
  assert.match(compose, /cpus:/g);
  assert.match(compose, /max-size:\s*["']20m["']/);
  assert.match(compose, /max-file:\s*["']5["']/);
  assert.match(compose, /docker-entrypoint-initdb\.d\/10-nongchang-roles\.sh:ro/);
  assert.match(compose, /shared_preload_libraries=pg_stat_statements/);
  assert.match(compose, /docker-entrypoint-initdb\.d\/20-observability\.sql:ro/);
  for (const role of ['APP_DATABASE_USER', 'MIGRATION_DATABASE_USER', 'BACKUP_DATABASE_USER']) {
    assert.match(compose, new RegExp(role));
    assert.match(roles, new RegExp(role));
  }
  assert.match(roles, /CREATE EXTENSION IF NOT EXISTS postgis/);
  assert.match(roles, /pg_read_all_data/);
  assert.match(roles, /ALTER DEFAULT PRIVILEGES/);
  assert.doesNotMatch(roles, /\bCREATEDB\b/);
  assert.match(compose, /image: prom\/prometheus:v3\.4\.2/);
  assert.match(compose, /profiles: \[monitoring\]/);
  assert.match(compose, /network_mode: host/);
  assert.match(compose, /--storage\.tsdb\.retention\.time=3d/);
  assert.match(compose, /--web\.listen-address=127\.0\.0\.1:59090/);
  assert.match(compose, /mem_limit: 256m/);
});

test('PM2 template separates blue, green, and the single worker on loopback', async () => {
  const ecosystem = await read('ops/pm2/ecosystem.config.cjs');
  for (const name of ['nongchang-api-blue', 'nongchang-api-green', 'nongchang-worker']) {
    assert.match(ecosystem, new RegExp(name));
  }
  for (const port of ['3001', '3002', '3003']) assert.match(ecosystem, new RegExp(`PORT: '${port}'`));
  assert.equal((ecosystem.match(/HOST: '127\.0\.0\.1'/g) ?? []).length, 3);
  assert.equal((ecosystem.match(/OPERATIONS_WORKERS_ENABLED: 'true'/g) ?? []).length, 1);
  assert.equal((ecosystem.match(/OPERATIONS_WORKERS_ENABLED: 'false'/g) ?? []).length, 2);
  assert.match(ecosystem, /max_memory_restart: '768M'/);
  assert.match(ecosystem, /max_memory_restart: '512M'/);
  assert.match(ecosystem, /sharedRoot/);
  assert.match(ecosystem, /nongchang-api-blue\.out\.log/);
  assert.match(ecosystem, /nongchang-api-green\.out\.log/);
  assert.match(ecosystem, /nongchang-worker\.out\.log/);
});

test('Nginx template keeps the app same-origin and metrics private', async () => {
  const nginx = await read('ops/nginx/farm.qingyouai.com.conf.template');
  assert.match(nginx, /server_name farm\.qingyouai\.com/);
  assert.match(nginx, /return 301 https:\/\/\$host\$request_uri/);
  assert.match(nginx, /root \/www\/wwwroot\/farm\.qingyouai\.com\/current\/web/);
  assert.match(nginx, /location = \/api\/metrics/);
  assert.match(nginx, /allow 127\.0\.0\.1/);
  assert.match(nginx, /deny all/);
  assert.match(nginx, /include \/www\/wwwroot\/farm\.qingyouai\.com\/shared\/active-api\.conf/);
  assert.match(nginx, /proxy_set_header X-Request-Id \$request_id/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(nginx, /listen 127\.0\.0\.1:9091/);
  assert.match(nginx, /Content-Security-Policy/);
  assert.match(nginx, /Permissions-Policy/);
});

test('Prometheus follows the active API through the loopback metrics proxy and scrapes the worker separately', async () => {
  const prometheus = await read('ops/prometheus/prometheus.yml');
  assert.doesNotMatch(prometheus, /host\.docker\.internal|:3001/);
  assert.match(prometheus, /job_name: nongchang-api/);
  assert.match(prometheus, /127\.0\.0\.1:9091/);
  assert.match(prometheus, /job_name: nongchang-worker/);
  assert.match(prometheus, /127\.0\.0\.1:3003/);
  assert.match(prometheus, /credentials_file:/);
});

test('environment templates contain names but no committed secret values', async () => {
  const dataEnv = await read('ops/data-stack/data-stack.env.example');
  const runtimeEnv = await read('ops/runtime/production.env.example');
  for (const key of [
    'POSTGRES_PASSWORD=',
    'APP_DATABASE_PASSWORD=',
    'MIGRATION_DATABASE_PASSWORD=',
    'BACKUP_DATABASE_PASSWORD=',
    'REDIS_PASSWORD=',
    'PGBOUNCER_AUTH_FILE=',
    'METRICS_BEARER_TOKEN_FILE=',
  ]) assert.match(dataEnv, new RegExp(key));
  for (const key of ['JWT_SECRET=', 'JWT_REFRESH_SECRET=', 'APP_ENCRYPTION_KEY=', 'METRICS_BEARER_TOKEN=']) {
    assert.match(runtimeEnv, new RegExp(key));
  }
  assert.doesNotMatch(`${dataEnv}\n${runtimeEnv}`, /password123|replace-with-real-secret|BEGIN (?:RSA )?PRIVATE KEY/i);
});

test('tag release runs the canonical production, browser, backup, query-plan, audit, and release-script gates', async () => {
  const workflow = await read('.github/workflows/release.yml');
  for (const command of [
    'pnpm verify:production',
    'pnpm test:browser',
    'pnpm test:accessibility',
    'pnpm --filter @nongchang/backend db:query-plans',
    'pnpm backup:verify-restore',
    'pnpm audit:prod',
    'pnpm release:test',
  ]) assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('browser harness can move its loopback backend without stopping unrelated services', async () => {
  const playwright = await read('playwright.config.ts');
  const vite = await read('packages/web/vite.config.ts');
  assert.match(playwright, /E2E_BACKEND_PORT/);
  assert.match(playwright, /VITE_BACKEND_PROXY_TARGET/);
  assert.match(vite, /VITE_BACKEND_PROXY_TARGET/);
  assert.doesNotMatch(vite, /target:\s*['"]http:\/\/localhost:3001['"]/);
});
