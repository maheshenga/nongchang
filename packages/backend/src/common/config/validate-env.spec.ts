import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './validate-env';

// validateEnv 读取 process.env,逐用例快照并还原,避免污染其它测试。
const KEYS = [
  'NODE_ENV', 'DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'APP_ENCRYPTION_KEY', 'ALLOW_MANUAL_PAY',
  'TRUST_PROXY_HOPS', 'UPLOAD_DAILY_BYTES_LIMIT', 'UPLOAD_ACTIVE_BYTES_LIMIT',
  'UPLOAD_PENDING_MAX_AGE_MINUTES', 'RUNTIME_STATE_DRIVER', 'REDIS_URL',
  'OPERATIONS_WORKER_CONCURRENCY',
  'OTEL_SERVICE_NAME', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'METRICS_BEARER_TOKEN',
  'HOST',
];

let snapshot: Record<string, string | undefined>;

function setValidProdEnv() {
  process.env.DATABASE_URL = 'postgresql://x';
  process.env.JWT_SECRET = 'a'.repeat(40);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
  process.env.APP_ENCRYPTION_KEY = '0'.repeat(64);
  process.env.REDIS_URL = 'redis://127.0.0.1:56379';
}

beforeEach(() => {
  snapshot = {};
  for (const k of KEYS) snapshot[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe('validateEnv ALLOW_MANUAL_PAY 生产熔断', () => {
  it('生产环境 ALLOW_MANUAL_PAY=true:抛错', () => {
    process.env.NODE_ENV = 'production';
    setValidProdEnv();
    process.env.ALLOW_MANUAL_PAY = 'true';
    expect(() => validateEnv()).toThrow(/ALLOW_MANUAL_PAY/);
  });

  it('生产环境 ALLOW_MANUAL_PAY=false:通过', () => {
    process.env.NODE_ENV = 'production';
    setValidProdEnv();
    process.env.ALLOW_MANUAL_PAY = 'false';
    expect(() => validateEnv()).not.toThrow();
  });

  it('生产环境未设 ALLOW_MANUAL_PAY:通过', () => {
    process.env.NODE_ENV = 'production';
    setValidProdEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it('非生产环境 ALLOW_MANUAL_PAY=true:通过(本地联调放行)', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.JWT_SECRET = 'dev-access-secret-change-me';
    process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-me';
    process.env.APP_ENCRYPTION_KEY = '0'.repeat(64);
    process.env.ALLOW_MANUAL_PAY = 'true';
    expect(() => validateEnv()).not.toThrow();
  });
});

describe('validateEnv 基础密钥校验', () => {
  it('缺 DATABASE_URL:抛错', () => {
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it('生产环境弱 JWT_SECRET:抛错', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.JWT_SECRET = 'change-me';
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
    process.env.APP_ENCRYPTION_KEY = '0'.repeat(64);
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('缺 APP_ENCRYPTION_KEY:抛错', () => {
    process.env.DATABASE_URL = 'postgresql://x';
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
    expect(() => validateEnv()).toThrow(/APP_ENCRYPTION_KEY/);
  });
});

describe('validateEnv runtime safety limits', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    setValidProdEnv();
  });

  it.each(['-1', '6', '1.5', 'x'])('rejects invalid TRUST_PROXY_HOPS=%s', (value) => {
    process.env.TRUST_PROXY_HOPS = value;
    expect(() => validateEnv()).toThrow(/TRUST_PROXY_HOPS/);
  });

  it.each([
    ['UPLOAD_DAILY_BYTES_LIMIT', '0'],
    ['UPLOAD_DAILY_BYTES_LIMIT', String(Number.MAX_SAFE_INTEGER + 1)],
    ['UPLOAD_ACTIVE_BYTES_LIMIT', '5242879'],
    ['UPLOAD_PENDING_MAX_AGE_MINUTES', '0'],
  ])('rejects invalid %s=%s', (name, value) => {
    process.env[name] = value;
    expect(() => validateEnv()).toThrow(new RegExp(name));
  });

  it('keeps safe non-production defaults usable', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('rejects a wildcard application listen address', () => {
    process.env.HOST = '0.0.0.0';
    expect(() => validateEnv()).toThrow(/HOST.*127\.0\.0\.1/);
  });

  it('requires REDIS_URL when production uses distributed runtime state', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;
    expect(() => validateEnv()).toThrow(/REDIS_URL/);
  });

  it('allows the memory adapter outside production', () => {
    process.env.RUNTIME_STATE_DRIVER = 'memory';
    delete process.env.REDIS_URL;
    expect(() => validateEnv()).not.toThrow();
  });

  it.each(['0', '33', '1.5', 'x'])('rejects invalid OPERATIONS_WORKER_CONCURRENCY=%s', (value) => {
    process.env.OPERATIONS_WORKER_CONCURRENCY = value;
    expect(() => validateEnv()).toThrow(/OPERATIONS_WORKER_CONCURRENCY/);
  });

  it('rejects unsafe telemetry endpoint and metrics credential configuration', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'file:///tmp/traces';
    expect(() => validateEnv()).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.METRICS_BEARER_TOKEN = 'short';
    expect(() => validateEnv()).toThrow(/METRICS_BEARER_TOKEN/);
  });
});
