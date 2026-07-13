import { describe, expect, it } from 'vitest';
import { readDatabaseRuntimeConfig } from './database-runtime.config';

describe('readDatabaseRuntimeConfig', () => {
  it('returns safe defaults', () => {
    expect(readDatabaseRuntimeConfig({})).toEqual({
      poolMax: 20,
      poolTimeoutSeconds: 10,
      statementTimeoutMs: 30_000,
    });
  });

  it.each([
    ['DATABASE_POOL_MAX', '0'],
    ['DATABASE_POOL_MAX', '101'],
    ['DATABASE_POOL_TIMEOUT_SECONDS', '0'],
    ['DATABASE_STATEMENT_TIMEOUT_MS', '99'],
    ['DATABASE_STATEMENT_TIMEOUT_MS', '300001'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => readDatabaseRuntimeConfig({ [name]: value })).toThrow(new RegExp(name));
  });
});
