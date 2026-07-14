import type {
  TenantReadinessCheck,
  TenantReadinessCode,
  TenantReadinessTarget,
  TenantReadinessView,
} from '@nongchang/shared';

export type TenantReadinessFacts = Record<TenantReadinessCode, boolean>;

const CHECKS: ReadonlyArray<{
  code: TenantReadinessCode;
  label: string;
  target?: TenantReadinessTarget;
}> = [
  { code: 'legal', label: '法律协议已发布', target: 'legalSettings' },
  { code: 'wechat', label: '微信小程序已启用', target: 'integrations' },
  { code: 'oss', label: '对象存储已启用', target: 'aiOssSettings' },
  { code: 'map', label: '地图服务已启用', target: 'integrations' },
  { code: 'ai', label: 'AI 服务商已启用', target: 'aiProviders' },
  { code: 'payment', label: '支付宝支付已启用', target: 'billing' },
  { code: 'quota', label: '初始业务额度已配置', target: 'billing' },
  { code: 'apiDomain', label: '公网 API 域名已配置' },
  { code: 'supportContact', label: '小程序客服联系方式已配置' },
  { code: 'salesContact', label: '销售开通联系方式已配置' },
];

export function buildTenantReadiness(facts: TenantReadinessFacts): TenantReadinessView {
  const checks: TenantReadinessCheck[] = CHECKS.map((check) => ({
    ...check,
    ready: facts[check.code],
  }));
  return {
    ready: checks.every((check) => check.ready),
    checks,
  };
}
