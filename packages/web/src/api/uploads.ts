import { uploadResponseSchema, type UploadResponse } from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export type UploadPurpose = 'farm-record' | 'ai-diagnose';

export async function uploadImage(file: File, purpose: UploadPurpose): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  return parseResponse(uploadResponseSchema, await request<unknown>(
    `/uploads?purpose=${encodeURIComponent(purpose)}`,
    { method: 'POST', body: form },
  ), 'uploads.create');
}
