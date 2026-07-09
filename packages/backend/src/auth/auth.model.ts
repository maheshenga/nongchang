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

export function isKnownRole(role: string): role is Role {
  return (Object.values(Role) as string[]).includes(role);
}

export function toAuthUser(user: AuthAccountSnapshot): AuthUser {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as Role,
    agentId: user.agentId ?? null,
    ownerId: user.role === Role.MERCHANT ? user.id : null,
    sessionVersion: user.sessionVersion ?? 0,
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
