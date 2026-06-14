import type { AiChatResponse, AiDiagnoseResponse, AiDiagnoseInput } from '@nongchang/shared';
import { request } from './request';

export function aiChat(message: string): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
}
export function aiDiagnose(input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
  return request<AiDiagnoseResponse>('/ai/diagnose', { method: 'POST', body: JSON.stringify(input) });
}
