import {
  aiTestResponseSchema,
  ossConfigViewSchema,
  type AiTestResponse,
  type OssConfigInput,
  type OssConfigView,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getOssConfig(): Promise<OssConfigView | null> {
  return parseResponse(ossConfigViewSchema.nullable(), await request<unknown>('/oss-config'), 'oss.get');
}
export async function upsertOssConfig(input: OssConfigInput): Promise<OssConfigView> {
  return parseResponse(ossConfigViewSchema, await request<unknown>('/oss-config', {
    method: 'PUT', body: JSON.stringify(input),
  }), 'oss.upsert');
}
export async function testOssConfig(): Promise<AiTestResponse> {
  return parseResponse(aiTestResponseSchema, await request<unknown>('/oss-config/test', { method: 'POST' }), 'oss.test');
}
