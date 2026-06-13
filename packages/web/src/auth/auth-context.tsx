import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser, LoginDto } from '@nongchang/shared';
import { getTokens, setTokens, clearTokens } from './token-store';
import { decodeToken } from './decode-token';
import { login as loginRequest } from '../api/auth';
import { setOnAuthExpired } from '../api/request';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (dto: LoginDto) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const tokens = getTokens();
    return tokens ? decodeToken(tokens.accessToken) : null;
  });

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    // request.ts 刷新失败时回调:清空会话
    setOnAuthExpired(() => setUser(null));
  }, []);

  const login = useCallback(async (dto: LoginDto) => {
    const tokens = await loginRequest(dto);
    setTokens(tokens);
    const decoded = decodeToken(tokens.accessToken);
    if (!decoded) throw new Error('登录令牌无效');
    setUser(decoded);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
