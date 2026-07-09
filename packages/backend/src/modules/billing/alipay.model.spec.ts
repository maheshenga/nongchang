import { describe, expect, it } from 'vitest';
import {
  ALIPAY_CONFIGURED_MASK,
  ALIPAY_PROVIDER,
  DEFAULT_ALIPAY_GATEWAY,
  buildAlipayConfigUpsertArgs,
  buildAlipayConfigView,
  buildAlipayPaymentRequest,
  buildAlipayPaymentView,
  buildAlipaySdkOptions,
  isAlipayPaidAmountValid,
  isSuccessfulAlipayTradeStatus,
  resolveAlipaySettlementChannel,
  trimTrailingSlash,
} from './alipay.model';

const enabledRow = { appId: 'app1', secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)', enabled: true };

describe('alipay model helpers', () => {
  it('keeps provider and configured mask stable', () => {
    expect(ALIPAY_PROVIDER).toBe('alipay');
    expect(ALIPAY_CONFIGURED_MASK).toBe('已配置(已加密)');
    expect(DEFAULT_ALIPAY_GATEWAY).toBe('https://openapi.alipay.com/gateway.do');
  });

  it('builds masked config views without exposing encrypted or plain keys', () => {
    expect(buildAlipayConfigView(enabledRow)).toEqual({
      appId: 'app1',
      privateKeyMasked: '已配置(已加密)',
      alipayPublicKeyMasked: '已配置(已加密)',
      enabled: true,
    });
    expect(buildAlipayConfigView({ appId: null, secretEnc: null, apiKeyEnc: null, enabled: false })).toEqual({
      appId: null,
      privateKeyMasked: null,
      alipayPublicKeyMasked: null,
      enabled: false,
    });
  });

  it('builds config upsert args with create nulls and sparse encrypted updates', () => {
    expect(buildAlipayConfigUpsertArgs({
      tenantId: 't1',
      appId: 'app1',
      enabled: true,
      secretEnc: 'ENC(priv)',
      apiKeyEnc: 'ENC(pub)',
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'alipay' } },
      create: { tenantId: 't1', provider: 'alipay', appId: 'app1', secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)', enabled: true },
      update: { appId: 'app1', enabled: true, secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)' },
    });

    expect(buildAlipayConfigUpsertArgs({
      tenantId: 't1',
      appId: 'app2',
      enabled: false,
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'alipay' } },
      create: { tenantId: 't1', provider: 'alipay', appId: 'app2', secretEnc: null, apiKeyEnc: null, enabled: false },
      update: { appId: 'app2', enabled: false },
    });
  });

  it('builds SDK options with default or provided gateway', () => {
    expect(buildAlipaySdkOptions({
      row: enabledRow,
      privateKey: 'priv',
      alipayPublicKey: 'pub',
    })).toEqual({
      appId: 'app1',
      privateKey: 'priv',
      alipayPublicKey: 'pub',
      gateway: 'https://openapi.alipay.com/gateway.do',
      signType: 'RSA2',
    });
    expect(buildAlipaySdkOptions({
      row: enabledRow,
      privateKey: 'priv',
      alipayPublicKey: 'pub',
      gateway: 'https://sandbox.example/gateway.do',
    }).gateway).toBe('https://sandbox.example/gateway.do');
  });

  it('builds PC payment request with correct URLs, amount, subject, and method', () => {
    const request = buildAlipayPaymentRequest({
      order: { id: 'o1', amountCents: 1000, resource: 'AI', quantity: 100 },
      channel: 'PC',
      publicBaseUrl: 'https://api.example.com/',
      webBaseUrl: 'https://web.example.com/',
    });

    expect(request.method).toBe('alipay.trade.page.pay');
    expect(request.params.method).toBe('GET');
    expect(request.params.notify_url).toBe('https://api.example.com/api/billing/alipay/notify');
    expect(request.params.return_url).toBe('https://web.example.com/#/billing/pay-result?orderId=o1');
    expect(request.params.bizContent).toMatchObject({
      out_trade_no: 'o1',
      total_amount: '10.00',
      subject: '额度购买-AI算力-100',
      product_code: 'FAST_INSTANT_TRADE_PAY',
      timeout_express: '30m',
    });
  });

  it('builds WAP payment request and QR-code subject fallback', () => {
    const request = buildAlipayPaymentRequest({
      order: { id: 'o2', amountCents: 199, resource: 'CODE', quantity: 20 },
      channel: 'WAP',
      publicBaseUrl: 'https://api.example.com',
      webBaseUrl: '',
    });

    expect(request.method).toBe('alipay.trade.wap.pay');
    expect(request.params.method).toBe('POST');
    expect(request.params.return_url).toBe('/#/billing/pay-result?orderId=o2');
    expect(request.params.bizContent.total_amount).toBe('1.99');
    expect(request.params.bizContent.subject).toBe('额度购买-二维码-20');
    expect(request.params.bizContent.product_code).toBe('QUICK_WAP_WAY');
  });

  it('builds channel-specific payment views', () => {
    expect(buildAlipayPaymentView({ orderId: 'o1', channel: 'PC', result: 'https://pay.example' })).toEqual({
      orderId: 'o1',
      channel: 'PC',
      payUrl: 'https://pay.example',
      formHtml: null,
    });
    expect(buildAlipayPaymentView({ orderId: 'o1', channel: 'WAP', result: '<form />' })).toEqual({
      orderId: 'o1',
      channel: 'WAP',
      payUrl: null,
      formHtml: '<form />',
    });
  });

  it('validates notify trade statuses, amounts, settlement channel, and url trimming', () => {
    expect(isSuccessfulAlipayTradeStatus('TRADE_SUCCESS')).toBe(true);
    expect(isSuccessfulAlipayTradeStatus('TRADE_FINISHED')).toBe(true);
    expect(isSuccessfulAlipayTradeStatus('WAIT_BUYER_PAY')).toBe(false);
    expect(isSuccessfulAlipayTradeStatus(undefined)).toBe(false);
    expect(isAlipayPaidAmountValid('10.00', 1000)).toBe(true);
    expect(isAlipayPaidAmountValid('10.005', 1001)).toBe(true);
    expect(isAlipayPaidAmountValid('abc', 1000)).toBe(false);
    expect(isAlipayPaidAmountValid(undefined, 1000)).toBe(false);
    expect(resolveAlipaySettlementChannel(null)).toBe('alipay');
    expect(resolveAlipaySettlementChannel('custom')).toBe('custom');
    expect(trimTrailingSlash('https://api.example.com/')).toBe('https://api.example.com');
  });
});
