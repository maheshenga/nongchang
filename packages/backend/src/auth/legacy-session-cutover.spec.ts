import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260717060000_invalidate_legacy_sessions',
  'migration.sql',
);

describe('legacy session cutover migration', () => {
  it('invalidates every token issued before the typed-session rollout', async () => {
    const sql = await readFile(MIGRATION_PATH, 'utf8').catch(() => '');

    expect(sql).toContain(
      'UPDATE "users" SET "session_version" = "session_version" + 1;',
    );
  });
});
