import { AuthUser, Role } from '@nongchang/shared';

export interface AuthAccountSnapshot {
  id: string;
  tenantId: string;
  role: string;
  agentId: string | null;
  sessionVersion?: number | null;
}

export interface RefreshAccountSnapshot extends AuthAccountSnapshot {
  status: string;
  tenant: { status: string };
}

export interface WebSessionAccountSnapshot extends RefreshAccountSnapshot {
  webSessionVersion?: number | null;
}

export interface GenericSessionAuthUser extends AuthUser {
  sessionKind: 'generic';
}

export interface WebSessionAuthUser extends AuthUser {
  webSessionVersion: number;
  sessionKind: 'web';
}

export type SessionAuthUser = GenericSessionAuthUser | WebSessionAuthUser;

export type SessionTokenClaims = AuthUser & {
  sessionKind?: 'generic' | 'web';
  webSessionVersion?: number;
};

export function isKnownRole(role: string): role is Role {
  return (Object.values(Role) as string[]).includes(role);
}

export function toAuthUser(user: AuthAccountSnapshot): GenericSessionAuthUser {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as Role,
    agentId: user.agentId ?? null,
    ownerId: user.role === Role.MERCHANT ? user.id : null,
    sessionVersion: user.sessionVersion ?? 0,
    sessionKind: 'generic',
  };
}

export function toWebSessionAuthUser(user: AuthAccountSnapshot & { webSessionVersion?: number | null }): WebSessionAuthUser {
  return {
    ...toAuthUser(user),
    webSessionVersion: user.webSessionVersion ?? 0,
    sessionKind: 'web',
  };
}

export function canRefreshSession(
  user: RefreshAccountSnapshot | null | undefined,
  tokenSessionVersion: number,
): user is RefreshAccountSnapshot {
  if (!user) return false;
  return user.status === 'active'
    && user.tenant.status === 'active'
    && (user.sessionVersion ?? 0) === tokenSessionVersion;
}

export function canRefreshWebSession(
  user: WebSessionAccountSnapshot | null | undefined,
  tokenSessionVersion: number,
  tokenWebSessionVersion: number,
): user is WebSessionAccountSnapshot {
  return canRefreshSession(user, tokenSessionVersion)
    && (user.webSessionVersion ?? 0) === tokenWebSessionVersion;
}
