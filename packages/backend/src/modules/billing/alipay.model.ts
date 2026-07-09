import type { AlipayConfigView, PaymentView } from '@nongchang/shared';

export const ALIPAY_PROVIDER = 'alipay';
export const ALIPAY_CONFIGURED_MASK = '已配置(已加密)';
export const DEFAULT_ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export interface AlipayRow {
  appId: string | null;
  secretEnc: string | null;
  apiKeyEnc: string | null;
  enabled: boolean;
}

export interface AlipayOrderForPayment {
  id: string;
  amountCents: number;
  resource: string;
  quantity: number;
}

export function buildAlipayConfigView(row: AlipayRow): AlipayConfigView {
  return {
    appId: row.appId ?? null,
    privateKeyMasked: row.secretEnc ? ALIPAY_CONFIGURED_MASK : null,
    alipayPublicKeyMasked: row.apiKeyEnc ? ALIPAY_CONFIGURED_MASK : null,
    enabled: row.enabled,
  };
}

export function buildAlipayConfigUpsertArgs(input: {
  tenantId: string;
  appId: string;
  enabled: boolean;
  secretEnc?: string;
  apiKeyEnc?: string;
}) {
  const update: Record<string, unknown> = { appId: input.appId, enabled: input.enabled };
  if (input.secretEnc) update.secretEnc = input.secretEnc;
  if (input.apiKeyEnc) update.apiKeyEnc = input.apiKeyEnc;

  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: ALIPAY_PROVIDER } },
    create: {
      tenantId: input.tenantId,
      provider: ALIPAY_PROVIDER,
      appId: input.appId,
      secretEnc: input.secretEnc ?? null,
      apiKeyEnc: input.apiKeyEnc ?? null,
      enabled: input.enabled,
    },
    update,
  };
}

export function buildAlipaySdkOptions(input: {
  row: AlipayRow;
  privateKey: string;
  alipayPublicKey: string;
  gateway?: string;
}) {
  return {
    appId: input.row.appId as string,
    privateKey: input.privateKey,
    alipayPublicKey: input.alipayPublicKey,
    gateway: input.gateway || DEFAULT_ALIPAY_GATEWAY,
    signType: 'RSA2' as const,
  };
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function buildAlipayPaymentRequest(input: {
  order: AlipayOrderForPayment;
  channel: 'PC' | 'WAP';
  publicBaseUrl: string;
  webBaseUrl: string;
}) {
  const method = input.channel === 'PC' ? 'alipay.trade.page.pay' : 'alipay.trade.wap.pay';
  const productCode = input.channel === 'PC' ? 'FAST_INSTANT_TRADE_PAY' : 'QUICK_WAP_WAY';

  return {
    method,
    params: {
      notify_url: `${trimTrailingSlash(input.publicBaseUrl)}/api/billing/alipay/notify`,
      return_url: `${trimTrailingSlash(input.webBaseUrl)}/#/billing/pay-result?orderId=${input.order.id}`,
      bizContent: {
        out_trade_no: input.order.id,
        total_amount: (input.order.amountCents / 100).toFixed(2),
        subject: `额度购买-${input.order.resource === 'AI' ? 'AI算力' : '二维码'}-${input.order.quantity}`,
        product_code: productCode,
        timeout_express: '30m',
      },
      method: input.channel === 'PC' ? 'GET' : 'POST',
    } as const,
  };
}

export function buildAlipayPaymentView(input: { orderId: string; channel: 'PC' | 'WAP'; result: string }): PaymentView {
  return {
    orderId: input.orderId,
    channel: input.channel,
    payUrl: input.channel === 'PC' ? input.result : null,
    formHtml: input.channel === 'WAP' ? input.result : null,
  };
}

export function isSuccessfulAlipayTradeStatus(status: string | undefined): boolean {
  return status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED';
}

export function isAlipayPaidAmountValid(totalAmount: string | undefined, amountCents: number): boolean {
  const paidYuan = Number(totalAmount);
  return Number.isFinite(paidYuan) && Math.round(paidYuan * 100) === amountCents;
}

export function resolveAlipaySettlementChannel(payChannel: string | null | undefined): string {
  return payChannel ?? ALIPAY_PROVIDER;
}
