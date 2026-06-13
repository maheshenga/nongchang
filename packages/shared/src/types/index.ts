import { Role } from '../enums';
export interface AuthUser {
  userId: string; tenantId: string; role: Role;
  agentId: string | null; ownerId: string | null;
}
export interface TokenPair { accessToken: string; refreshToken: string; }
