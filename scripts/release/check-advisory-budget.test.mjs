import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectPackageVersions,
  normalizeBulkAdvisories,
  validateAdvisoryBudget,
} from './check-advisory-budget.mjs';

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

test('bulk audit input contains every resolved production dependency version and skips workspace links', () => {
  const versions = collectPackageVersions([{
    name: '@nongchang/backend',
    dependencies: {
      express: {
        version: '5.1.0',
        dependencies: { qs: { version: '6.14.0' } },
      },
      '@nongchang/shared': { version: 'link:../shared' },
    },
    optionalDependencies: { sharp: { version: '0.34.0' } },
  }]);
  assert.deepEqual(versions, {
    express: ['5.1.0'],
    qs: ['6.14.0'],
    sharp: ['0.34.0'],
  });
});

test('bulk registry advisories normalize GitHub advisory IDs for the existing budget policy', () => {
  assert.deepEqual(normalizeBulkAdvisories({
    lodash: [{
      id: 1106913,
      url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
      severity: 'high',
    }],
  }), [{ package: 'lodash', advisory: 'GHSA-35jh-r3h4-6jhm', severity: 'high' }]);
  assert.throws(
    () => normalizeBulkAdvisories({ lodash: [{ id: 1, url: 'https://invalid.example/1', severity: 'high' }] }),
    /GitHub advisory ID/,
  );
});
