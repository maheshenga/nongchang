import type {
  IntegrationConfigView, IntegrationProvider,
  WechatConfigInput, XfyunConfigInput,
} from '@nongchang/shared';
import { request } from './request';

export function getIntegrationConfig(provider: IntegrationProvider): Promise<IntegrationConfigView | null> {
  return request<IntegrationConfigView | null>(`/integration-configs/${encodeURIComponent(provider)}`);
}
export function upsertWechatConfig(input: WechatConfigInput): Promise<IntegrationConfigView> {
  return request<IntegrationConfigView>('/integration-configs/wechat', { method: 'PUT', body: JSON.stringify(input) });
}
export function upsertXfyunConfig(input: XfyunConfigInput): Promise<IntegrationConfigView> {
  return request<IntegrationConfigView>('/integration-configs/xfyun', { method: 'PUT', body: JSON.stringify(input) });
}
