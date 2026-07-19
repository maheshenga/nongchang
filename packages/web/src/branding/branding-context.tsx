import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_TENANT_SETTINGS,
  type TenantSettingsView,
  type UpdateTenantSettingsInput,
} from '@nongchang/shared';
import { useAuth } from '../auth/auth-context';
import { fetchTenantSettings, saveTenantSettings } from '../api/tenant-settings';

export type BrandingContextValue = TenantSettingsView & {
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (input: UpdateTenantSettingsInput) => Promise<TenantSettingsView>;
};

const fallbackSettings: TenantSettingsView = { ...DEFAULT_TENANT_SETTINGS };

const defaultValue: BrandingContextValue = {
  ...fallbackSettings,
  loading: false,
  error: null,
  reload: async () => undefined,
  save: async () => fallbackSettings,
};

const BrandingContext = createContext<BrandingContextValue>(defaultValue);

function identityOf(user: { userId?: string; tenantId?: string | null; role?: string } | null | undefined): string {
  if (!user) return 'anonymous';
  return `${user.userId ?? ''}:${user.tenantId ?? ''}:${user.role ?? ''}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '租户展示配置加载失败';
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const identity = identityOf(user);
  const [settings, setSettings] = useState<TenantSettingsView>(fallbackSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated || !user?.tenantId) {
      setSettings(fallbackSettings);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchTenantSettings();
      setSettings(next);
      setError(null);
    } catch (err) {
      setSettings(fallbackSettings);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.tenantId]);

  useEffect(() => {
    setSettings(fallbackSettings);
    setError(null);
    void reload();
  }, [identity, reload]);

  const save = useCallback(async (input: UpdateTenantSettingsInput) => {
    const next = await saveTenantSettings(input);
    setSettings(next);
    setError(null);
    return next;
  }, []);

  const value = useMemo<BrandingContextValue>(() => ({
    ...settings,
    loading,
    error,
    reload,
    save,
  }), [settings, loading, error, reload, save]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
