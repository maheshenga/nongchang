import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginDto, MeProfileView } from '@nongchang/shared';
import { clearAccessToken, setAccessToken } from './token-store';
import { decodeToken } from './decode-token';
import { getMe, webLogin, webLogout } from '../api/auth';
import { refreshWebSession, setOnAuthExpired } from '../api/request';
import { resetAppQueryCache } from '../query-client';

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
  const sessionEpochRef = useRef(0);

  const setCurrentUser = useCallback((next: AuthUser | null) => {
    const previous = userRef.current;
    const previousIdentity = previous
      ? `${previous.userId}:${previous.tenantId ?? ''}:${previous.role}`
      : null;
    const nextIdentity = next
      ? `${next.userId}:${next.tenantId ?? ''}:${next.role}`
      : null;
    if (previousIdentity !== nextIdentity) void resetAppQueryCache();
    userRef.current = next;
    setUser(next);
  }, []);

  const clearClientSession = useCallback(() => {
    sessionEpochRef.current += 1;
    clearAccessToken();
    setCurrentUser(null);
    setProfile(null);
  }, [setCurrentUser]);

  const updateProfile = useCallback((me: MeProfileView) => {
    const current = userRef.current;
    if (current?.userId !== me.id) return;
    setProfile(me);
  }, []);

  useEffect(() => {
    setOnAuthExpired(clearClientSession);
    return () => setOnAuthExpired(() => undefined);
  }, [clearClientSession]);

  useEffect(() => {
    let cancelled = false;
    const bootstrapEpoch = sessionEpochRef.current;

    void refreshWebSession()
      .then((accessToken) => {
        if (cancelled || sessionEpochRef.current !== bootstrapEpoch || !accessToken) return;
        const decoded = decodeToken(accessToken);
        if (!decoded) {
          clearClientSession();
          return;
        }
        setAccessToken(accessToken);
        setCurrentUser(decoded);
      })
      .catch(() => {
        if (!cancelled) clearClientSession();
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clearClientSession, setCurrentUser]);

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
    void getMe()
      .then((me) => {
        if (!cancelled && userRef.current?.userId === requestedUserId) updateProfile(me);
      })
      .catch(() => {
        if (!cancelled && userRef.current?.userId === requestedUserId) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user, updateProfile]);

  const login = useCallback(async (dto: LoginDto) => {
    const response = await webLogin(dto);
    const decoded = decodeToken(response.accessToken);
    if (!decoded) throw new Error('登录令牌无效');

    sessionEpochRef.current += 1;
    setAccessToken(response.accessToken);
    setProfile(null);
    setCurrentUser(decoded);
  }, [setCurrentUser]);

  const logout = useCallback(async () => {
    clearClientSession();
    try {
      await webLogout();
    } catch {
      // Local memory is already cleared; a network failure must not restore the session.
    }
  }, [clearClientSession]);

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
