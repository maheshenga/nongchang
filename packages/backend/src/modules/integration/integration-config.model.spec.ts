import { describe, expect, it } from 'vitest';
import {
  buildIntegrationConfigView,
  buildTiandituUpsertArgs,
  buildWechatUpsertArgs,
  buildXfyunUpsertArgs,
  canUseWechatTenant,
  canUseXfyunCredentials,
  resolveEnabledTiandituKey,
} from './integration-config.model';

describe('integration config model helpers', () => {
  const baseRow = {
    id: 'i1',
    tenantId: 't1',
    provider: 'wechat',
    appId: 'wxAPP',
    secretEnc: 'ENC(secret)',
    apiKeyEnc: null,
    apiSecretEnc: null,
    enabled: true,
  };

  it('projects integration config views with masked values supplied by service', () => {
    expect(buildIntegrationConfigView({
      row: baseRow,
      secretMasked: '****1234',
      apiKeyMasked: null,
      apiSecretMasked: null,
    })).toEqual({
      provider: 'wechat',
      appId: 'wxAPP',
      secretMasked: '****1234',
      apiKeyMasked: null,
      apiSecretMasked: null,
      enabled: true,
    });
  });

  it('builds WeChat upsert args with sparse secret update', () => {
    expect(buildWechatUpsertArgs({
      tenantId: 't1',
      appId: 'wxAPP',
      enabled: true,
      secretEnc: 'ENC(secret)',
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'wechat' } },
      create: { tenantId: 't1', provider: 'wechat', appId: 'wxAPP', secretEnc: 'ENC(secret)', enabled: true },
      update: { appId: 'wxAPP', enabled: true, secretEnc: 'ENC(secret)' },
    });

    expect(buildWechatUpsertArgs({
      tenantId: 't1',
      appId: 'wxAPP2',
      enabled: false,
      secretEnc: null,
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'wechat' } },
      create: { tenantId: 't1', provider: 'wechat', appId: 'wxAPP2', secretEnc: null, enabled: false },
      update: { appId: 'wxAPP2', enabled: false },
    });
  });

  it('builds Xfyun upsert args with sparse API key updates', () => {
    expect(buildXfyunUpsertArgs({
      tenantId: 't1',
      appId: 'xf01',
      enabled: true,
      apiKeyEnc: 'ENC(key)',
      apiSecretEnc: 'ENC(secret)',
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'xfyun' } },
      create: {
        tenantId: 't1',
        provider: 'xfyun',
        appId: 'xf01',
        apiKeyEnc: 'ENC(key)',
        apiSecretEnc: 'ENC(secret)',
        enabled: true,
      },
      update: { appId: 'xf01', enabled: true, apiKeyEnc: 'ENC(key)', apiSecretEnc: 'ENC(secret)' },
    });

    expect(buildXfyunUpsertArgs({
      tenantId: 't1',
      appId: 'xf02',
      enabled: false,
      apiKeyEnc: null,
      apiSecretEnc: null,
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'xfyun' } },
      create: {
        tenantId: 't1',
        provider: 'xfyun',
        appId: 'xf02',
        apiKeyEnc: null,
        apiSecretEnc: null,
        enabled: false,
      },
      update: { appId: 'xf02', enabled: false },
    });
  });

  it('builds Tianditu upsert args using plaintext key as appId', () => {
    expect(buildTiandituUpsertArgs({ tenantId: 't1', key: 'TDT_KEY', enabled: true })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'tianditu' } },
      create: { tenantId: 't1', provider: 'tianditu', appId: 'TDT_KEY', enabled: true },
      update: { appId: 'TDT_KEY', enabled: true },
    });
  });

  it('resolves enabled Tianditu key only when row is enabled and has appId', () => {
    expect(resolveEnabledTiandituKey(null)).toBeNull();
    expect(resolveEnabledTiandituKey({ enabled: false, appId: 'TDT_KEY' })).toBeNull();
    expect(resolveEnabledTiandituKey({ enabled: true, appId: null })).toBeNull();
    expect(resolveEnabledTiandituKey({ enabled: true, appId: 'TDT_KEY' })).toBe('TDT_KEY');
  });

  it('checks whether WeChat and Xfyun credentials are usable', () => {
    expect(canUseWechatTenant(null)).toBe(false);
    expect(canUseWechatTenant({ enabled: false, secretEnc: 'ENC(secret)' })).toBe(false);
    expect(canUseWechatTenant({ enabled: true, secretEnc: null })).toBe(false);
    expect(canUseWechatTenant({ enabled: true, secretEnc: 'ENC(secret)' })).toBe(true);

    expect(canUseXfyunCredentials(null)).toBe(false);
    expect(canUseXfyunCredentials({
      enabled: false,
      appId: 'app',
      apiKeyEnc: 'key',
      apiSecretEnc: 'secret',
    })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: null, apiKeyEnc: 'key', apiSecretEnc: 'secret' })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: 'app', apiKeyEnc: null, apiSecretEnc: 'secret' })).toBe(false);
    expect(canUseXfyunCredentials({ enabled: true, appId: 'app', apiKeyEnc: 'key', apiSecretEnc: null })).toBe(false);
    expect(canUseXfyunCredentials({
      enabled: true,
      appId: 'app',
      apiKeyEnc: 'key',
      apiSecretEnc: 'secret',
    })).toBe(true);
  });
});
