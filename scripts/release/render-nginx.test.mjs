import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderActiveApi, writeActiveApiAtomic } from './render-nginx.mjs';

test('active Nginx upstream can target only the loopback blue or green API', () => {
  assert.equal(renderActiveApi(3001), 'proxy_pass http://127.0.0.1:3001;\n');
  assert.equal(renderActiveApi(3002), 'proxy_pass http://127.0.0.1:3002;\n');
  assert.throws(() => renderActiveApi(3003), /3001 or 3002/);
  assert.throws(() => renderActiveApi('http://example.com'), /3001 or 3002/);
});

test('active Nginx upstream is replaced atomically', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nongchang-nginx-'));
  try {
    const target = join(dir, 'active-api.conf');
    await writeActiveApiAtomic(target, 3002);
    assert.equal(await readFile(target, 'utf8'), 'proxy_pass http://127.0.0.1:3002;\n');
    assert.deepEqual(await readdir(dir), ['active-api.conf']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
