import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAdvisoryBudget } from './check-advisory-budget.mjs';

const validEntry = {
  package: 'tool', advisory: 'GHSA-aaaa-bbbb-cccc', owner: 'platform',
  reason: 'Pinned transitive development tool.', compensatingControl: 'Not exposed in production.',
  expires: '2026-08-01',
};

test('moderate advisory budget requires complete unexpired entries', () => {
  assert.doesNotThrow(() => validateAdvisoryBudget(
    { policy: { moderateExceptionMaxDays: 90 }, exceptions: [validEntry] },
    [{ package: 'tool', advisory: validEntry.advisory, severity: 'moderate' }],
    new Date('2026-07-13T00:00:00Z'),
  ));
  assert.throws(() => validateAdvisoryBudget(
    { policy: { moderateExceptionMaxDays: 90 }, exceptions: [] },
    [{ package: 'tool', advisory: validEntry.advisory, severity: 'moderate' }],
    new Date('2026-07-13T00:00:00Z'),
  ), /missing moderate advisory budget/i);
});

test('high or critical advisories and overlong exceptions fail closed', () => {
  assert.throws(() => validateAdvisoryBudget(
    { policy: { moderateExceptionMaxDays: 90 }, exceptions: [] },
    [{ package: 'runtime', advisory: 'GHSA-high-risk1', severity: 'high' }],
    new Date('2026-07-13T00:00:00Z'),
  ), /high or critical/i);
  assert.throws(() => validateAdvisoryBudget(
    { policy: { moderateExceptionMaxDays: 90 }, exceptions: [{ ...validEntry, expires: '2027-01-01' }] },
    [{ package: 'tool', advisory: validEntry.advisory, severity: 'moderate' }],
    new Date('2026-07-13T00:00:00Z'),
  ), /90 days/i);
});
