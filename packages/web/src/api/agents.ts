import type { CreateAgentDto, AgentListItem, UpdateAgentDto } from '@nongchang/shared';
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

export function listAgents(): Promise<AgentListItem[]> {
  return request<AgentListItem[]>('/agents');
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

export function listMerchants(): Promise<MerchantUser[]> {
  return request<MerchantUser[]>('/agents/merchants');
}
