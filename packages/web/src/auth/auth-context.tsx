import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthUser, LoginDto, MeProfileView } from '@nongchang/shared';
import { clearAccessToken, setAccessToken } from './token-store';
import { decodeToken } from './decode-token';
import { getMe, webLogin, webLogout } from '../api/auth';
import { refreshWebSession, setOnAuthExpired } from '../api/request';

interface AuthContextValue {
  user: AuthUser | null;
  profile: MeProfileView | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (dto: LoginDto) => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  updateProfile: (me: MeProfileView) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<MeProfileView | null>(null);
  const [isReady, setIsReady] = useState(false);
  const userRef = useRef<AuthUser | null>(null);

  const setCurrentUser = useCallback((next: AuthUser | null) => {
    userRef.current = next;
    setUser(next);
  }, []);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setCurrentUser(null);
    setProfile(null);
  }, [setCurrentUser]);

  const applyAccessToken = useCallback((accessToken: string) => {
    const decoded = decodeToken(accessToken);
    if (!decoded) {
      clearSession();
      throw new Error('登录令牌无效');
    }
    setProfile(null);
    setCurrentUser(decoded);
  }, [clearSession, setCurrentUser]);

  const updateProfile = useCallback((me: MeProfileView) => {
    if (userRef.current?.userId !== me.id) return;
    setProfile(me);
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    try {
      await webLogout();
    } catch {
      // The local session is already cleared when the browser is offline.
    }
  }, [clearSession]);

  useEffect(() => {
    setOnAuthExpired(clearSession);
    return () => setOnAuthExpired(() => {});
  }, [clearSession]);

  useEffect(() => {
    let active = true;
    void refreshWebSession()
      .then((accessToken) => {
        if (!active) return;
        if (!accessToken) {
          clearSession();
          return;
        }
        try {
          applyAccessToken(accessToken);
        } catch {
          clearSession();
        }
      })
      .catch(() => {
        if (active) clearSession();
      })
      .finally(() => {
        if (active) setIsReady(true);
      });
    return () => { active = false; };
  }, [applyAccessToken, clearSession]);

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
    const { accessToken } = await webLogin(dto);
    setAccessToken(accessToken);
    applyAccessToken(accessToken);
  }, [applyAccessToken]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isAuthenticated: !!user,
      isReady,
      login,
      logout,
      reloadProfile,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
