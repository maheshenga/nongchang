import type { AuthUser } from '@nongchang/shared';

export function decodeToken(token: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = JSON.parse(atob(b64)) as Partial<AuthUser>;
    if (typeof json.userId !== 'string' || typeof json.role !== 'string') return null;
    return {
      userId: json.userId,
      tenantId: json.tenantId as string,
      role: json.role as AuthUser['role'],
      agentId: json.agentId ?? null,
      ownerId: json.ownerId ?? null,
    };
  } catch {
    return null;
  }
}
