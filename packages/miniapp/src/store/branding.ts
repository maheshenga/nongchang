import Taro from '@tarojs/taro';
import {
  DEFAULT_TENANT_SETTINGS,
  tenantSettingsViewSchema,
  type TenantSettingsView,
} from '@nongchang/shared';
import { getToken } from './auth';
import { fetchTenantSettings } from '../api/tenant-settings';

const STORAGE_PREFIX = 'tenant_branding:';

let currentToken = '';
let currentBranding: TenantSettingsView = { ...DEFAULT_TENANT_SETTINGS };
let brandingRequestSequence = 0;

function storageKey(token: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(token)}`;
}

function readCachedBranding(token: string): TenantSettingsView | null {
  try {
    const raw = Taro.getStorageSync(storageKey(token));
    if (!raw) return null;
    return tenantSettingsViewSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCachedBranding(token: string, branding: TenantSettingsView): void {
  try {
    Taro.setStorageSync(storageKey(token), JSON.stringify(branding));
  } catch {
    // cache is best effort only
  }
}

export function clearTenantBranding(): void {
  brandingRequestSequence += 1;
  currentToken = '';
  currentBranding = { ...DEFAULT_TENANT_SETTINGS };
}

export function getTenantBranding(): TenantSettingsView {
  return currentBranding;
}

export async function loadTenantBranding(
  options: { forceRefresh?: boolean } = {},
): Promise<TenantSettingsView> {
  const requestSequence = ++brandingRequestSequence;
  const forceRefresh = options.forceRefresh === true;
  const token = getToken();
  if (!token) {
    if (requestSequence === brandingRequestSequence) {
      currentToken = '';
      currentBranding = { ...DEFAULT_TENANT_SETTINGS };
    }
    return currentBranding;
  }

  if (token !== currentToken) {
    currentToken = token;
    currentBranding = { ...DEFAULT_TENANT_SETTINGS };
  }

  const cached = forceRefresh ? null : readCachedBranding(token);
  if (cached) {
    if (requestSequence === brandingRequestSequence) {
      currentBranding = cached;
    }
    return currentBranding;
  }

  try {
    const branding = tenantSettingsViewSchema.parse(await fetchTenantSettings());
    if (requestSequence !== brandingRequestSequence) {
      return currentBranding;
    }
    currentBranding = branding;
    writeCachedBranding(token, branding);
    return currentBranding;
  } catch {
    if (requestSequence === brandingRequestSequence) {
      currentBranding = { ...DEFAULT_TENANT_SETTINGS };
    }
    return currentBranding;
  }
}
