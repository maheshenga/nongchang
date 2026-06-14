import type { AiProviderView, CreateAiProviderInput, UpdateAiProviderInput, AiTestResponse } from '@nongchang/shared';
import { request } from './request';

export function listAiProviders(): Promise<AiProviderView[]> {
  return request<AiProviderView[]>('/ai-providers');
}
export function createAiProvider(input: CreateAiProviderInput): Promise<AiProviderView> {
  return request<AiProviderView>('/ai-providers', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAiProvider(id: string, input: UpdateAiProviderInput): Promise<AiProviderView> {
  return request<AiProviderView>(`/ai-providers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteAiProvider(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/ai-providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function testAiProvider(id: string): Promise<AiTestResponse> {
  return request<AiTestResponse>(`/ai-providers/${encodeURIComponent(id)}/test`, { method: 'POST' });
}
