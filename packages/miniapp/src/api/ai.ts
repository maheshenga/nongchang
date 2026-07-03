import { request, uploadMultipart } from './request';
import type { AiChatResponse, AiDiagnoseResponse, AiTranscribeResponse, AiAdviceInput } from '@nongchang/shared';

export async function aiChat(message: string): Promise<string> {
  const res = await request<AiChatResponse>({
    url: '/ai/chat', method: 'POST', data: { message },
  });
  return res.answer;
}

export async function aiAdvice(input: AiAdviceInput): Promise<string> {
  const res = await request<AiChatResponse>({ url: '/ai/advice', method: 'POST', data: { batchId: input.batchId } });
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

// 上传录音文件到后端转写(走 Taro.uploadFile,multipart)。
export async function transcribeVoice(filePath: string): Promise<string> {
  const res = await uploadMultipart('/ai/transcribe', filePath);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = (() => {
      try { return (JSON.parse(res.data) as { message?: string }).message; } catch { return undefined; }
    })();
    throw new Error(msg || `语音转写失败(${res.statusCode})`);
  }
  const body = JSON.parse(res.data) as AiTranscribeResponse;
  return body.text;
}

// 把后端「未配置 provider/视觉模型」类错误转成用户可读提示。
export function normalizeAiError(e: unknown): string {
  if (e instanceof Error) {
    if (/未配置|provider|视觉模型/i.test(e.message)) return 'AI 服务未配置，请联系管理员';
    return e.message;
  }
  return 'AI 调用失败';
}
