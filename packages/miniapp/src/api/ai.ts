import { request } from './request';
import type { AiChatResponse, AiDiagnoseResponse } from '@nongchang/shared';

export async function aiChat(message: string): Promise<string> {
  const res = await request<AiChatResponse>({
    url: '/ai/chat', method: 'POST', data: { message },
  });
  return res.answer;
}

export async function aiDiagnose(imageUrl: string, note?: string): Promise<string> {
  const data: Record<string, unknown> = { imageUrl };
  if (note && note.trim()) data.note = note.trim();
  const res = await request<AiDiagnoseResponse>({
    url: '/ai/diagnose', method: 'POST', data,
  });
  return res.result;
}

// 把后端「未配置 provider/视觉模型」类错误转成用户可读提示。
export function normalizeAiError(e: unknown): string {
  if (e instanceof Error) {
    if (/未配置|provider|视觉模型/i.test(e.message)) return 'AI 服务未配置，请联系管理员';
    return e.message;
  }
  return 'AI 调用失败';
}
