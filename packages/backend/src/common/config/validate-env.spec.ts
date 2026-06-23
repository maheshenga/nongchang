import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './validate-env';

// validateEnv 读取 process.env,逐用例快照并还原,避免污染其它测试。
const KEYS = [
  'NODE_ENV', 'DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'APP_ENCRYPTION_KEY', 'ALLOW_MANUAL_PAY',
];

let snapshot: Record<string, string | undefined>;

function setValidProdEnv() {
  process.env.DATABASE_URL = 'postgresql://x';
  process.env.JWT_SECRET = 'a'.repeat(40);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
  process.env.APP_ENCRYPTION_KEY = '0'.repeat(64);
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
