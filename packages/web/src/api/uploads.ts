import type { UploadResponse } from '@nongchang/shared';
import { request } from './request';

// 上传单张图片到 OSS,返回可访问 URL。后端端点 POST /uploads(multipart,字段名 file)。
export function uploadImage(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  return request<UploadResponse>('/uploads', { method: 'POST', body: form });
}
