import { Role, type AuthUser, type CreateAgentDto, type ListQuery, type UpdateAgentDto } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';

export const DEFAULT_AGENT_LIST_CAP = 500;

export const AGENT_LIST_SELECT = {
  id: true,
  name: true,
  region: true,
  status: true,
  createdAt: true,
  _count: { select: { users: { where: { role: Role.MERCHANT, status: { not: 'pending' } } } } },
} as const;

export const MERCHANT_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  agentId: true,
  displayName: true,
} as const;

export interface AgentListRow {
  id: string;
  name: string;
  region: string;
  status: string;
  createdAt: Date;
  _count: { users: number };
}

export function buildAgentCreateData(user: AuthUser, dto: CreateAgentDto) {
  return { tenantId: user.tenantId, ...dto };
}

export function buildAgentListWhere(user: AuthUser, query?: ListQuery): Record<string, unknown> {
  return {
    tenantId: user.tenantId,
    ...(query?.search ? {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { region: { contains: query.search, mode: 'insensitive' } },
      ],
    } : {}),
  };
}

export function buildAgentListItem(row: AgentListRow) {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    merchantCount: row._count.users,
  };
}

export function buildAgentUpdateData(dto: UpdateAgentDto): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.region !== undefined) data.region = dto.region;
  return data;
}

export function buildAgentStatusUpdateData(status: 'active' | 'suspended') {
  return { status };
}

export function buildAgentSessionRevocationWhere(user: AuthUser, agentId: string) {
  return { tenantId: user.tenantId, agentId };
}

export function buildMerchantListWhere(user: AuthUser, query?: ListQuery): Record<string, unknown> | null {
  const where: Record<string, unknown> = { tenantId: user.tenantId, role: Role.MERCHANT };
  if (user.role === Role.AGENT_ADMIN) {
    if (!user.agentId) return null;
    where.agentId = user.agentId;
  }
  if (query?.search) {
    where.OR = [
      { displayName: { contains: query.search, mode: 'insensitive' } },
      { username: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function buildPagination(query?: ListQuery) {
  const paginated = isPaginated(query);
  const page = paginated ? query.page ?? 1 : 1;
  const pageSize = paginated ? query.pageSize ?? 20 : 20;
  return {
    paginated,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: paginated ? pageSize : DEFAULT_AGENT_LIST_CAP,
  };
}
