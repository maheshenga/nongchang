import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { LoginDto, MeProfileView, WebAccessTokenResponse } from '@nongchang/shared';
import { clearAccessToken, getAccessToken } from './token-store';

const loginMock = vi.fn<(dto: LoginDto) => Promise<WebAccessTokenResponse>>();
const logoutMock = vi.fn<() => Promise<void>>();
const getMeMock = vi.fn<() => Promise<MeProfileView>>();
const refreshSessionMock = vi.fn<() => Promise<string | null>>();

vi.mock('../api/auth', () => ({
  webLogin: (dto: LoginDto) => loginMock(dto),
  webLogout: () => logoutMock(),
  getMe: () => getMeMock(),
}));

vi.mock('../api/request', () => ({
  refreshWebSession: () => refreshSessionMock(),
  setOnAuthExpired: vi.fn(),
}));

import { AuthProvider, useAuth } from './auth-context';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const profileA: MeProfileView = {
  id: 'u1',
  tenantId: 't1',
  username: 'merchantA',
  role: 'merchant',
  agentId: null,
  displayName: 'Farm A',
  phone: null,
  status: 'active',
};

const profileB: MeProfileView = {
  ...profileA,
  id: 'u2',
  username: 'merchantB',
  displayName: 'Farm B',
};

const userOneAccessToken = () => makeJwt({
  userId: 'u1', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'u1',
});

describe('AuthProvider', () => {
  beforeEach(() => {
    clearAccessToken();
    loginMock.mockReset();
    logoutMock.mockReset();
    getMeMock.mockReset();
    refreshSessionMock.mockReset();
    refreshSessionMock.mockResolvedValue(null);
    logoutMock.mockResolvedValue(undefined);
    getMeMock.mockResolvedValue(profileA);
  });

  it('starts unready, restores from cookie refresh, and then loads the signed-in profile', async () => {
    const accessToken = userOneAccessToken();
    let resolveRefresh!: (value: string | null) => void;
    refreshSessionMock.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isReady).toBe(false);
    await act(async () => { resolveRefresh(accessToken); });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.user?.userId).toBe('u1');
    await waitFor(() => expect(result.current.profile?.displayName).toBe('Farm A'));
  });

  it('settles into a ready unauthenticated state when cookie refresh fails', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logs in through the web endpoint and keeps only an in-memory access token', async () => {
    const accessToken = userOneAccessToken();
    loginMock.mockResolvedValueOnce({ accessToken });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.login({ tenantCode: 't1', username: 'merchantA', password: 'password123' });
    });

    expect(result.current.user?.userId).toBe('u1');
    expect(getAccessToken()).toBe(accessToken);
    expect(localStorage.length).toBe(0);
  });

  it('clears local access state even when web logout fails', async () => {
    const accessToken = userOneAccessToken();
    loginMock.mockResolvedValueOnce({ accessToken });
    logoutMock.mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await act(async () => {
      await result.current.login({ tenantCode: 't1', username: 'merchantA', password: 'password123' });
    });

    await act(async () => { await result.current.logout(); });

    expect(logoutMock).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('clears local access state before a delayed web logout completes', async () => {
    const accessToken = userOneAccessToken();
    loginMock.mockResolvedValueOnce({ accessToken });
    let resolveLogout!: () => void;
    logoutMock.mockReturnValueOnce(new Promise((resolve) => { resolveLogout = resolve; }));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await act(async () => {
      await result.current.login({ tenantCode: 't1', username: 'merchantA', password: 'password123' });
    });

    let logoutPromise!: Promise<void>;
    act(() => { logoutPromise = result.current.logout(); });

    expect(getAccessToken()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();

    await act(async () => {
      resolveLogout();
      await logoutPromise;
    });
  });

  it('ignores a pending profile reload after logout', async () => {
    refreshSessionMock.mockResolvedValueOnce(userOneAccessToken());
    getMeMock.mockResolvedValueOnce(profileA);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    let resolveReload!: (value: MeProfileView) => void;
    getMeMock.mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }));
    const reload = result.current.reloadProfile();
    await act(async () => {
      await result.current.logout();
      resolveReload(profileA);
      await reload;
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('ignores profile data that belongs to a previous user', async () => {
    refreshSessionMock.mockResolvedValueOnce(userOneAccessToken());

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    act(() => result.current.updateProfile(profileB));

    expect(result.current.profile?.id).toBe('u1');
  });
});
