import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { AuthUser, LoginDto, MeProfileView } from '@nongchang/shared';
import { getTokens, setTokens, clearTokens } from './token-store';
import { decodeToken } from './decode-token';
import { getMe, login as loginRequest } from '../api/auth';
import { setOnAuthExpired } from '../api/request';

interface AuthContextValue {
  user: AuthUser | null;
  profile: MeProfileView | null;
  isAuthenticated: boolean;
  login: (dto: LoginDto) => Promise<void>;
  logout: () => void;
  reloadProfile: () => Promise<void>;
  updateProfile: (me: MeProfileView) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const tokens = getTokens();
    return tokens ? decodeToken(tokens.accessToken) : null;
  });
  const [profile, setProfile] = useState<MeProfileView | null>(null);
  const userRef = useRef<AuthUser | null>(user);

  const setCurrentUser = useCallback((next: AuthUser | null) => {
    userRef.current = next;
    setUser(next);
  }, []);

  const updateProfile = useCallback((me: MeProfileView) => {
    const current = userRef.current;
    if (current?.userId !== me.id) return;
    setProfile(me);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setCurrentUser(null);
    setProfile(null);
  }, [setCurrentUser]);

  useEffect(() => {
    // request.ts 刷新失败时回调:清空会话
    setOnAuthExpired(() => {
      setCurrentUser(null);
      setProfile(null);
    });
  }, [setCurrentUser]);

  const reloadProfile = useCallback(async () => {
    const requestedUserId = userRef.current?.userId;
    if (!requestedUserId) return;
    const me = await getMe();
    if (userRef.current?.userId === requestedUserId) updateProfile(me);
  }, [updateProfile]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const requestedUserId = user.userId;
    getMe()
      .then((me) => {
        if (!cancelled && userRef.current?.userId === requestedUserId) updateProfile(me);
      })
      .catch(() => {
        if (!cancelled && userRef.current?.userId === requestedUserId) setProfile(null);
      });
    return () => { cancelled = true; };
  }, [user, updateProfile]);

  const login = useCallback(async (dto: LoginDto) => {
    const tokens = await loginRequest(dto);
    setTokens(tokens);
    const decoded = decodeToken(tokens.accessToken);
    if (!decoded) throw new Error('登录令牌无效');
    setCurrentUser(decoded);
  }, [setCurrentUser]);

  return (
    <AuthContext.Provider value={{ user, profile, isAuthenticated: !!user, login, logout, reloadProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
