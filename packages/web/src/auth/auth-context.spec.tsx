import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { LoginDto, MeProfileView, WebAccessTokenResponse } from '@nongchang/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccessToken, getAccessToken } from './token-store';

const webLoginMock = vi.fn<(dto: LoginDto) => Promise<WebAccessTokenResponse>>();
const webLogoutMock = vi.fn<() => Promise<void>>();
const getMeMock = vi.fn<() => Promise<MeProfileView>>();
const refreshWebSessionMock = vi.fn<() => Promise<string | null>>();
let authExpiredCallback: (() => void) | null = null;

vi.mock('../api/auth', () => ({
  webLogin: (dto: LoginDto) => webLoginMock(dto),
  webLogout: () => webLogoutMock(),
  getMe: () => getMeMock(),
}));

vi.mock('../api/request', () => ({
  refreshWebSession: () => refreshWebSessionMock(),
  setOnAuthExpired: (callback: () => void) => {
    authExpiredCallback = callback;
  },
}));

import { AuthProvider, useAuth } from './auth-context';

function makeJwt(payload: Record<string, unknown>): string {
  const base64 = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64(payload)}.signature`;
}

const accessA = makeJwt({
  userId: 'u1',
  tenantId: 't1',
  role: 'merchant',
  agentId: null,
  ownerId: 'u1',
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const profileA: MeProfileView = {
  id: 'u1',
  tenantId: 't1',
  username: 'merchantA',
  role: 'merchant',
  agentId: null,
  displayName: 'Merchant A',
  phone: null,
  status: 'active',
};

const profileB: MeProfileView = {
  ...profileA,
  id: 'u2',
  username: 'merchantB',
  displayName: 'Merchant B',
};

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
    authExpiredCallback = null;
    webLoginMock.mockReset();
    webLogoutMock.mockReset().mockResolvedValue();
    getMeMock.mockReset().mockResolvedValue(profileA);
    refreshWebSessionMock.mockReset();
  });

  it('starts unready, bootstraps once from the cookie, then exposes the decoded user', async () => {
    let resolveRefresh!: (token: string | null) => void;
    refreshWebSessionMock.mockReturnValue(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isReady).toBe(false);
    expect(result.current.user).toBeNull();
    await act(async () => resolveRefresh(accessA));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.user?.userId).toBe('u1');
    expect(refreshWebSessionMock).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBe(accessA);
    expect(localStorage.length).toBe(0);
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));
  });

  it('becomes ready and unauthenticated when bootstrap refresh fails', async () => {
    refreshWebSessionMock.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('does not restore a bootstrap session after logout clears it', async () => {
    let resolveRefresh!: (token: string | null) => void;
    refreshWebSessionMock.mockReturnValue(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => result.current.logout());
    await act(async () => resolveRefresh(accessA));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('logs in with the web endpoint and stores only the access token in memory', async () => {
    refreshWebSessionMock.mockResolvedValue(null);
    webLoginMock.mockResolvedValue({ accessToken: accessA });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => result.current.login({
      tenantCode: 'demo',
      username: 'merchantA',
      password: 'secret1',
    }));

    expect(result.current.user?.userId).toBe('u1');
    expect(getAccessToken()).toBe(accessA);
    expect(localStorage.length).toBe(0);
  });

  it('clears memory and state even when the logout request fails', async () => {
    refreshWebSessionMock.mockResolvedValue(accessA);
    webLogoutMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.userId).toBe('u1'));

    await act(async () => result.current.logout());

    expect(webLogoutMock).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('ignores a pending profile reload after logout', async () => {
    refreshWebSessionMock.mockResolvedValue(accessA);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    let resolveReload!: (value: MeProfileView) => void;
    getMeMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReload = resolve;
    }));
    const reload = result.current.reloadProfile();
    await act(async () => result.current.logout());
    await act(async () => {
      resolveReload(profileA);
      await reload;
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('ignores profile data that belongs to a different user', async () => {
    refreshWebSessionMock.mockResolvedValue(accessA);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    act(() => result.current.updateProfile(profileB));

    expect(result.current.profile?.id).toBe('u1');
  });

  it('clears React auth state when the request layer expires the session', async () => {
    refreshWebSessionMock.mockResolvedValue(accessA);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.userId).toBe('u1'));

    act(() => authExpiredCallback?.());

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });
});
