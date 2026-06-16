import type { AiChatResponse, AiDiagnoseResponse, AiDiagnoseInput, AiAdviceInput, AiAskInput } from '@nongchang/shared';
import { request } from './request';

export function aiChat(message: string): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) });
}
export function aiDiagnose(input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
  return request<AiDiagnoseResponse>('/ai/diagnose', { method: 'POST', body: JSON.stringify(input) });
}
export function aiAdvice(dto: AiAdviceInput): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/advice', { method: 'POST', body: JSON.stringify(dto) });
}
export function aiAsk(dto: AiAskInput): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/ask', { method: 'POST', body: JSON.stringify(dto) });
}
