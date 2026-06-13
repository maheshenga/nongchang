import type { CreateAgentDto } from '@nongchang/shared';
import { request } from './request';

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  region: string;
  status: string;
}

export interface MerchantUser {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
}

export function listAgents(): Promise<Agent[]> {
  return request<Agent[]>('/agents');
}

export function createAgent(dto: CreateAgentDto): Promise<Agent> {
  return request<Agent>('/agents', { method: 'POST', body: JSON.stringify(dto) });
}

export function listMerchants(): Promise<MerchantUser[]> {
  return request<MerchantUser[]>('/agents/merchants');
}
