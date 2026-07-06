import type { CreateAgentDto, AgentListItem, UpdateAgentDto, ListQuery, Paginated } from '@nongchang/shared';
import { request } from './request';

// 兼容旧引用(SystemAdmin.tsx):代理商列表项改用 shared 的 AgentListItem,tenantId 可选
export type Agent = AgentListItem & { tenantId?: string };

export interface MerchantUser {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
}

function withListQuery(path: string, query: Partial<ListQuery> = {}) {
  const qs = new URLSearchParams();
  if (query.page) qs.set('page', String(query.page));
  if (query.pageSize) qs.set('pageSize', String(query.pageSize));
  const s = qs.toString();
  return `${path}${s ? `?${s}` : ''}`;
}

export function listAgents<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? AgentListItem[] : Paginated<AgentListItem>> {
  return request(withListQuery('/agents', query ?? {}));
}

export function createAgent(dto: CreateAgentDto): Promise<AgentListItem> {
  return request<AgentListItem>('/agents', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateAgent(id: string, dto: UpdateAgentDto): Promise<AgentListItem> {
  return request<AgentListItem>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function setAgentStatus(id: string, status: 'active' | 'suspended'): Promise<{ id: string; status: string }> {
  return request(`/agents/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

export function listMerchants<T extends Partial<ListQuery> | undefined = undefined>(
  query?: T,
): Promise<T extends undefined ? MerchantUser[] : Paginated<MerchantUser>> {
  return request(withListQuery('/agents/merchants', query ?? {}));
}
