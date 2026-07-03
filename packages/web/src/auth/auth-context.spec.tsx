import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { LoginDto, MeProfileView, TokenPair } from '@nongchang/shared';
import { setTokens, clearTokens } from './token-store';

const loginMock = vi.fn<(dto: LoginDto) => Promise<TokenPair>>();
const getMeMock = vi.fn<() => Promise<MeProfileView>>();

vi.mock('../api/auth', () => ({
  login: (dto: LoginDto) => loginMock(dto),
  getMe: () => getMeMock(),
}));

import { AuthProvider, useAuth } from './auth-context';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  displayName: '大理基地',
  phone: null,
  status: 'active',
};

const profileB: MeProfileView = {
  id: 'u2',
  tenantId: 't1',
  username: 'merchantB',
  role: 'merchant',
  agentId: null,
  displayName: '上海基地',
  phone: null,
  status: 'active',
};

describe('AuthProvider', () => {
  beforeEach(() => {
    clearTokens();
    loginMock.mockReset();
    getMeMock.mockReset();
  });

  it('loads the signed-in profile from /auth/me when tokens already exist', async () => {
    setTokens({
      accessToken: makeJwt({
        userId: 'u1', tenantId: 't1', role: 'merchant',
        agentId: null, ownerId: 'u1',
      }),
      refreshToken: 'refresh-token',
    });
    getMeMock.mockResolvedValue(profileA);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user?.userId).toBe('u1');
    await waitFor(() => expect(result.current.profile?.displayName).toBe('大理基地'));
  });

  it('ignores a pending profile reload after logout', async () => {
    setTokens({
      accessToken: makeJwt({
        userId: 'u1', tenantId: 't1', role: 'merchant',
        agentId: null, ownerId: 'u1',
      }),
      refreshToken: 'refresh-token',
    });
    getMeMock.mockResolvedValueOnce(profileA);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    let resolveReload!: (value: MeProfileView) => void;
    getMeMock.mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }));
    const reload = result.current.reloadProfile();
    act(() => result.current.logout());
    await act(async () => { resolveReload(profileA); await reload; });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('ignores profile data that belongs to a previous user', async () => {
    setTokens({
      accessToken: makeJwt({
        userId: 'u1', tenantId: 't1', role: 'merchant',
        agentId: null, ownerId: 'u1',
      }),
      refreshToken: 'refresh-token',
    });
    getMeMock.mockResolvedValueOnce(profileA);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));

    act(() => result.current.updateProfile(profileB));

    expect(result.current.profile?.id).toBe('u1');
  });
});
