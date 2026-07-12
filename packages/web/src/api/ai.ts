import {
  aiChatResponseSchema,
  aiDiagnoseResponseSchema,
  type AiAdviceInput,
  type AiAskInput,
  type AiChatResponse,
  type AiDiagnoseInput,
  type AiDiagnoseResponse,
} from '@nongchang/shared';
import { createIdempotencyKey } from './idempotency';
import { parseResponse } from './parse-response';
import { request } from './request';

function idempotencyHeaders() {
  return { 'Idempotency-Key': createIdempotencyKey('ai') };
}

async function postChat(path: string, body: unknown, label: string): Promise<AiChatResponse> {
  return parseResponse(aiChatResponseSchema, await request<unknown>(path, {
    method: 'POST', body: JSON.stringify(body), headers: idempotencyHeaders(),
  }), label);
}

export function aiChat(message: string): Promise<AiChatResponse> {
  return postChat('/ai/chat', { message }, 'ai.chat');
}

export async function aiDiagnose(input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
  return parseResponse(aiDiagnoseResponseSchema, await request<unknown>('/ai/diagnose', {
    method: 'POST', body: JSON.stringify(input), headers: idempotencyHeaders(),
  }), 'ai.diagnose');
}

export function aiAdvice(dto: AiAdviceInput): Promise<AiChatResponse> {
  return postChat('/ai/advice', dto, 'ai.advice');
}

export function aiAsk(dto: AiAskInput): Promise<AiChatResponse> {
  return postChat('/ai/ask', dto, 'ai.ask');
}
