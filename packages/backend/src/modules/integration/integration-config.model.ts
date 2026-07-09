import type { IntegrationConfigView, IntegrationProvider } from '@nongchang/shared';

export interface IntegrationRow {
  id: string;
  tenantId: string;
  provider: string;
  appId: string | null;
  secretEnc: string | null;
  apiKeyEnc: string | null;
  apiSecretEnc: string | null;
  enabled: boolean;
}

export function buildIntegrationConfigView(input: {
  row: IntegrationRow;
  secretMasked: string | null;
  apiKeyMasked: string | null;
  apiSecretMasked: string | null;
}): IntegrationConfigView {
  return {
    provider: input.row.provider as IntegrationProvider,
    appId: input.row.appId ?? null,
    secretMasked: input.secretMasked,
    apiKeyMasked: input.apiKeyMasked,
    apiSecretMasked: input.apiSecretMasked,
    enabled: input.row.enabled,
  };
}

export function buildWechatUpsertArgs(input: {
  tenantId: string;
  appId: string;
  enabled: boolean;
  secretEnc: string | null;
}) {
  const update: Record<string, unknown> = { appId: input.appId, enabled: input.enabled };
  if (input.secretEnc) update.secretEnc = input.secretEnc;
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: 'wechat' } },
    create: {
      tenantId: input.tenantId,
      provider: 'wechat',
      appId: input.appId,
      secretEnc: input.secretEnc,
      enabled: input.enabled,
    },
    update,
  };
}

export function buildXfyunUpsertArgs(input: {
  tenantId: string;
  appId: string;
  enabled: boolean;
  apiKeyEnc: string | null;
  apiSecretEnc: string | null;
}) {
  const update: Record<string, unknown> = { appId: input.appId, enabled: input.enabled };
  if (input.apiKeyEnc) update.apiKeyEnc = input.apiKeyEnc;
  if (input.apiSecretEnc) update.apiSecretEnc = input.apiSecretEnc;
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: 'xfyun' } },
    create: {
      tenantId: input.tenantId,
      provider: 'xfyun',
      appId: input.appId,
      apiKeyEnc: input.apiKeyEnc,
      apiSecretEnc: input.apiSecretEnc,
      enabled: input.enabled,
    },
    update,
  };
}

export function buildTiandituUpsertArgs(input: { tenantId: string; key: string; enabled: boolean }) {
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: 'tianditu' } },
    create: { tenantId: input.tenantId, provider: 'tianditu', appId: input.key, enabled: input.enabled },
    update: { appId: input.key, enabled: input.enabled },
  };
}

export function resolveEnabledTiandituKey(row: Pick<IntegrationRow, 'enabled' | 'appId'> | null): string | null {
  if (!row || !row.enabled || !row.appId) return null;
  return row.appId;
}

export function canUseWechatTenant(
  row: Pick<IntegrationRow, 'enabled' | 'secretEnc'> | null,
): row is Pick<IntegrationRow, 'enabled' | 'secretEnc'> & { enabled: true; secretEnc: string } {
  return !!row?.enabled && !!row.secretEnc;
}

export function canUseXfyunCredentials(
  row: Pick<IntegrationRow, 'enabled' | 'appId' | 'apiKeyEnc' | 'apiSecretEnc'> | null,
): row is Pick<IntegrationRow, 'enabled' | 'appId' | 'apiKeyEnc' | 'apiSecretEnc'> & {
  enabled: true;
  appId: string;
  apiKeyEnc: string;
  apiSecretEnc: string;
} {
  return !!row?.enabled && !!row.appId && !!row.apiKeyEnc && !!row.apiSecretEnc;
}
