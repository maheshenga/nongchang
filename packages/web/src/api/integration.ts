import {
  integrationConfigViewSchema,
  tiandituPublicSchema,
  type IntegrationConfigView,
  type IntegrationProvider,
  type TiandituConfigInput,
  type TiandituPublicView,
  type WechatConfigInput,
  type XfyunConfigInput,
} from '@nongchang/shared';
import { parseResponse } from './parse-response';
import { request } from './request';

export async function getIntegrationConfig(provider: IntegrationProvider): Promise<IntegrationConfigView | null> {
  return parseResponse(integrationConfigViewSchema.nullable(), await request<unknown>(
    `/integration-configs/${encodeURIComponent(provider)}`,
  ), 'integration.get');
}
async function upsert(path: string, input: unknown, label: string): Promise<IntegrationConfigView> {
  return parseResponse(integrationConfigViewSchema, await request<unknown>(path, {
    method: 'PUT', body: JSON.stringify(input),
  }), label);
}
export function upsertWechatConfig(input: WechatConfigInput): Promise<IntegrationConfigView> {
  return upsert('/integration-configs/wechat', input, 'integration.wechat');
}
export function upsertXfyunConfig(input: XfyunConfigInput): Promise<IntegrationConfigView> {
  return upsert('/integration-configs/xfyun', input, 'integration.xfyun');
}
export function upsertTiandituConfig(input: TiandituConfigInput): Promise<IntegrationConfigView> {
  return upsert('/integration-configs/tianditu', input, 'integration.tianditu');
}
export async function getTiandituKey(): Promise<TiandituPublicView> {
  return parseResponse(tiandituPublicSchema, await request<unknown>('/integration-configs/tianditu/public-key'), 'integration.tiandituKey');
}
