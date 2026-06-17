import type {
  IntegrationConfigView, IntegrationProvider,
  WechatConfigInput, XfyunConfigInput, TiandituConfigInput, TiandituPublicView,
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
export function upsertTiandituConfig(input: TiandituConfigInput): Promise<IntegrationConfigView> {
  return request<IntegrationConfigView>('/integration-configs/tianditu', { method: 'PUT', body: JSON.stringify(input) });
}
// 取本租户启用中的天地图 key(供加载底图脚本),未启用返回 { key: null }
export function getTiandituKey(): Promise<TiandituPublicView> {
  return request<TiandituPublicView>('/integration-configs/tianditu/public-key');
}
