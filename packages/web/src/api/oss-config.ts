import type { OssConfigView, OssConfigInput, AiTestResponse } from '@nongchang/shared';
import { request } from './request';

export function getOssConfig(): Promise<OssConfigView | null> {
  return request<OssConfigView | null>('/oss-config');
}
export function upsertOssConfig(input: OssConfigInput): Promise<OssConfigView> {
  return request<OssConfigView>('/oss-config', { method: 'PUT', body: JSON.stringify(input) });
}
export function testOssConfig(): Promise<AiTestResponse> {
  return request<AiTestResponse>('/oss-config/test', { method: 'POST' });
}
