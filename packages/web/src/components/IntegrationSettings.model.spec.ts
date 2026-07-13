import { describe, expect, it } from 'vitest';
import { isIntegrationDirty, validateIntegrationDraft, type IntegrationDraft } from './IntegrationSettings.model';

const baseline: IntegrationDraft = {
  provider: 'wechat',
  appId: 'wx-app',
  enabled: false,
  secretChanged: false,
};

describe('integration settings draft model', () => {
  it('normalizes surrounding whitespace before comparing app ids', () => {
    expect(isIntegrationDirty(baseline, { ...baseline, appId: '  wx-app  ' })).toBe(false);
  });

  it('detects app id, enabled, and secret changes', () => {
    expect(isIntegrationDirty(baseline, { ...baseline, appId: 'wx-new' })).toBe(true);
    expect(isIntegrationDirty(baseline, { ...baseline, enabled: true })).toBe(true);
    expect(isIntegrationDirty(baseline, { ...baseline, secretChanged: true })).toBe(true);
  });

  it('requires the provider identifier and a first-time secret before enabling', () => {
    expect(validateIntegrationDraft({ ...baseline, appId: '', enabled: true }, false)).toContain('微信 AppID 不能为空');
    expect(validateIntegrationDraft({ ...baseline, enabled: true }, false)).toContain('首次启用微信登录时必须填写 AppSecret');
    expect(validateIntegrationDraft({ ...baseline, enabled: true, secretChanged: true }, false)).not.toContain('首次启用微信登录时必须填写 AppSecret');
  });
});
