import { ForbiddenException } from '@nestjs/common';
import { AuthUser, CreateUserDto, ReviewUserInput, Role } from '@nongchang/shared';

export function buildUserScopedWhere(actor: AuthUser): Record<string, string> {
  const where: Record<string, string> = { tenantId: actor.tenantId };
  if (actor.role === Role.AGENT_ADMIN) {
    if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
    where.agentId = actor.agentId;
  }
  return where;
}

export function resolveCreateUserAgentId(
  actor: AuthUser,
  dto: Pick<CreateUserDto, 'role' | 'agentId'>,
): string | null {
  if (actor.role === Role.AGENT_ADMIN) {
    if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
    if (!actor.agentId) throw new ForbiddenException('Agent admin is missing agentId');
    return actor.agentId;
  }
  if (dto.role === Role.MEMBER) return null;
  return dto.agentId ?? null;
}

export function buildMerchantTargetWhere(
  actor: AuthUser,
  id: string,
  statusFilter: 'pending' | 'manageable',
): Record<string, unknown> {
  return {
    ...buildUserScopedWhere(actor),
    id,
    role: Role.MERCHANT,
    status: statusFilter === 'pending' ? 'pending' : { not: 'pending' },
  };
}

export function buildUserStatusUpdateData(status: 'active' | 'suspended'): Record<string, unknown> {
  const data: Record<string, unknown> = { status };
  if (status === 'suspended') data.sessionVersion = { increment: 1 };
  return data;
}

export function reviewActionToStatus(action: ReviewUserInput['action']): 'active' | 'rejected' {
  return action === 'approve' ? 'active' : 'rejected';
}
