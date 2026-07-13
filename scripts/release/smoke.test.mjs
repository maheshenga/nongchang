import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForReadiness } from './smoke.mjs';

test('readiness gate fails after the bounded timeout', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });
  await assert.rejects(
    () => waitForReadiness('https://api.example/api/health/ready', { fetchImpl, attempts: 2, delayMs: 0 }),
    /readiness timeout/i,
  );
});

test('readiness gate returns after the first successful response', async () => {
  let calls = 0;
  const fetchImpl = async () => ({ ok: ++calls === 2, status: calls === 2 ? 200 : 503 });
  await waitForReadiness('https://api.example/api/health/ready', { fetchImpl, attempts: 3, delayMs: 0 });
  assert.equal(calls, 2);
});
