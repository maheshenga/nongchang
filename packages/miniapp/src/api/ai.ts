import {
  aiChatResponseSchema,
  aiDiagnoseResponseSchema,
  aiTranscribeResponseSchema,
  type AiAdviceInput,
} from '@nongchang/shared';
import { createIdempotencyKey } from './idempotency';
import { parseResponse } from './parse-response';
import { request, uploadMultipart } from './request';

function aiHeader() {
  return { 'Idempotency-Key': createIdempotencyKey('ai') };
}

export async function aiChat(message: string): Promise<string> {
  return parseResponse(aiChatResponseSchema, await request<unknown>({
    url: '/ai/chat', method: 'POST', data: { message }, header: aiHeader(),
  }), 'ai.chat').answer;
}

export async function aiAdvice(input: AiAdviceInput): Promise<string> {
  return parseResponse(aiChatResponseSchema, await request<unknown>({
    url: '/ai/advice', method: 'POST', data: { batchId: input.batchId }, header: aiHeader(),
  }), 'ai.advice').answer;
}

export async function aiDiagnose(imageUrl: string, note?: string): Promise<string> {
  const data: Record<string, unknown> = { imageUrl };
  if (note?.trim()) data.note = note.trim();
  return parseResponse(aiDiagnoseResponseSchema, await request<unknown>({
    url: '/ai/diagnose', method: 'POST', data, header: aiHeader(),
  }), 'ai.diagnose').result;
}

export async function transcribeVoice(filePath: string): Promise<string> {
  const response = await uploadMultipart('/ai/transcribe', filePath, aiHeader());
  if (response.statusCode < 200 || response.statusCode >= 300) {
    let message: string | undefined;
    try {
      const value: unknown = JSON.parse(response.data);
      if (value && typeof value === 'object' && 'message' in value && typeof (value as { message?: unknown }).message === 'string') {
        message = (value as { message: string }).message;
      }
    } catch {
      // Use the stable fallback.
    }
    throw new Error(message || `语音转写失败(${response.statusCode})`);
  }
  const value: unknown = JSON.parse(response.data);
  return parseResponse(aiTranscribeResponseSchema, value, 'ai.transcribe').text;
}

export function normalizeAiError(error: unknown): string {
  if (error instanceof Error) {
    if (/未配置|provider|视觉模型/i.test(error.message)) return 'AI 服务未配置，请联系管理员';
    return error.message;
  }
  return 'AI 调用失败';
}
