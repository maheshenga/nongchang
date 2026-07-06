import type { CreateTraceCredentialInput, TraceCredentialView, UploadResponse } from '@nongchang/shared';
import { request } from './request';

// 上传资质/检测文件(图片或 PDF)到 OSS,返回可访问 URL。
export async function uploadCredentialFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await request<UploadResponse>('/uploads?purpose=credential', { method: 'POST', body: form });
  return res.url;
}

export function listCredentials(batchId: string): Promise<TraceCredentialView[]> {
  return request<TraceCredentialView[]>(`/trace/credentials?batchId=${encodeURIComponent(batchId)}`);
}

export function createCredential(input: CreateTraceCredentialInput): Promise<TraceCredentialView> {
  return request<TraceCredentialView>('/trace/credentials', { method: 'POST', body: JSON.stringify(input) });
}

export function removeCredential(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/trace/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
