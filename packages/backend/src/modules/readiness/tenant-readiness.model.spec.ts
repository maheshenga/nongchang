import { describe, expect, it } from 'vitest';
import { buildTenantReadiness, type TenantReadinessFacts } from './tenant-readiness.model';

const allReady: TenantReadinessFacts = {
  legal: true,
  wechat: true,
  oss: true,
  map: true,
  ai: true,
  payment: true,
  quota: true,
  apiDomain: true,
  supportContact: true,
  salesContact: true,
};

describe('buildTenantReadiness', () => {
  it('reports ready only when all launch checks are ready', () => {
    expect(buildTenantReadiness(allReady).ready).toBe(true);

    const result = buildTenantReadiness({ ...allReady, legal: false, quota: false });
    expect(result.ready).toBe(false);
    expect(result.checks.filter((check) => !check.ready).map((check) => check.code))
      .toEqual(['legal', 'quota']);
  });

  it('returns operator labels and targets without configuration values', () => {
    const result = buildTenantReadiness(allReady);

    expect(result.checks).toContainEqual({
      code: 'legal',
      label: '法律协议已发布',
      ready: true,
      target: 'legalSettings',
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|apiKey|appId|https?:\/\//i);
  });
});
