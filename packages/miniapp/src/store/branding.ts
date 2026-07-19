import Taro from '@tarojs/taro';
import { DEFAULT_TENANT_SETTINGS, type TenantSettingsView } from '@nongchang/shared';
import { getToken } from './auth';
import { fetchTenantSettings } from '../api/tenant-settings';

const STORAGE_PREFIX = 'tenant_branding:';

let currentToken = '';
let currentBranding: TenantSettingsView = { ...DEFAULT_TENANT_SETTINGS };

function storageKey(token: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(token)}`;
}

function readCachedBranding(token: string): TenantSettingsView | null {
  try {
    const raw = Taro.getStorageSync(storageKey(token));
    if (!raw) return null;
    return JSON.parse(raw) as TenantSettingsView;
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
  currentToken = '';
  currentBranding = { ...DEFAULT_TENANT_SETTINGS };
}

export function getTenantBranding(): TenantSettingsView {
  return currentBranding;
}

export async function loadTenantBranding(): Promise<TenantSettingsView> {
  const token = getToken();
  if (!token) {
    clearTenantBranding();
    return currentBranding;
  }

  if (token !== currentToken) {
    currentToken = token;
    currentBranding = { ...DEFAULT_TENANT_SETTINGS };
  }

  const cached = readCachedBranding(token);
  if (cached) {
    currentBranding = cached;
    return currentBranding;
  }

  try {
    const branding = await fetchTenantSettings();
    currentBranding = branding;
    writeCachedBranding(token, branding);
    return branding;
  } catch {
    currentBranding = { ...DEFAULT_TENANT_SETTINGS };
    return currentBranding;
  }
}
