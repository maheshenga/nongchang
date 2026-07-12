import type { UploadResponse } from '@nongchang/shared';
import { request } from './request';

export type UploadPurpose = 'farm-record' | 'ai-diagnose';

// 上传单张图片到 OSS,返回可访问 URL。调用方必须声明业务用途。
export function uploadImage(file: File, purpose: UploadPurpose): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  return request<UploadResponse>(`/uploads?purpose=${encodeURIComponent(purpose)}`, { method: 'POST', body: form });
}
