import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';

// 模拟 alipay-sdk:实例方法 pageExec / checkNotifySign 可被各用例覆写。
const pageExec = vi.fn();
const checkNotifySign = vi.fn();
vi.mock('alipay-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ pageExec, checkNotifySign })),
}));

import { AlipayService } from './alipay.service';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const merchant: AuthUser = { userId: 'u3', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };

// 简化的加密桩:encrypt 加前缀、decrypt 去前缀,便于断言不回明文。
const enc: any = {
  encrypt: (p: string) => `ENC(${p})`,
  decrypt: (p: string) => p.replace(/^ENC\(|\)$/g, ''),
  maskSecret: (p: string) => '****' + p.slice(-4),
};

function makeService(opts: {
  configRow?: any;
  order?: any;
  settleSpy?: any;
} = {}) {
  const integrationConfig = {
    row: opts.configRow ?? null,
    findUnique: vi.fn(async () => integrationConfig.row),
    upsert: vi.fn(async (a: any) => {
      integrationConfig.row = { ...(integrationConfig.row ?? {}), ...a.create, ...a.update };
      return integrationConfig.row;
    }),
  };
  const prisma: any = {
    integrationConfig,
    creditOrder: {
      findFirst: vi.fn(async () => opts.order ?? null),
      findUnique: vi.fn(async () => opts.order ?? null),
    },
  };
  const settleOrder = opts.settleSpy ?? vi.fn(async () => ({}));
  const billing: any = { settleOrder };
  const svc = new AlipayService(prisma, enc, billing);
  return { svc, prisma, integrationConfig, settleOrder };
}

const enabledRow = { appId: 'app1', secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)', enabled: true };

beforeEach(() => {
  pageExec.mockReset();
  checkNotifySign.mockReset();
  process.env.PUBLIC_BASE_URL = 'https://api.example.com';
  process.env.WEB_BASE_URL = 'https://web.example.com';
});

describe('AlipayService.getConfig / upsertConfig', () => {
  it('非平台管理员查看配置抛 Forbidden', async () => {
    const { svc } = makeService();
    await expect(svc.getConfig(merchant)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('未配置返回 null', async () => {
    const { svc } = makeService({ configRow: null });
    await expect(svc.getConfig(sysadmin)).resolves.toBeNull();
  });

  it('已配置仅回掩码,绝不回明文', async () => {
    const { svc } = makeService({ configRow: enabledRow });
    const view = await svc.getConfig(sysadmin);
    expect(view).toMatchObject({ appId: 'app1', enabled: true });
    expect(view!.privateKeyMasked).toBe('已配置(已加密)');
    expect(view!.alipayPublicKeyMasked).toBe('已配置(已加密)');
    // 不得回明文或密文本体(值层面;key 名 privateKeyMasked 不算)
    expect(view!.privateKeyMasked).not.toContain('priv');
    expect(view!.privateKeyMasked).not.toContain('ENC(');
  });

  it('首次配置缺私钥/公钥抛 BadRequest', async () => {
    const { svc } = makeService({ configRow: null });
    await expect(svc.upsertConfig(sysadmin, { appId: 'app1', enabled: true } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('首次配置加密入库:secretEnc/apiKeyEnc 为密文', async () => {
    const { svc, integrationConfig } = makeService({ configRow: null });
    await svc.upsertConfig(sysadmin, { appId: 'app1', privateKey: 'priv', alipayPublicKey: 'pub', enabled: true } as any);
    const created = integrationConfig.upsert.mock.calls[0][0].create;
    expect(created.secretEnc).toBe('ENC(priv)');
    expect(created.apiKeyEnc).toBe('ENC(pub)');
  });

  it('非平台管理员写配置抛 Forbidden', async () => {
    const { svc } = makeService();
    await expect(svc.upsertConfig(merchant, { appId: 'x', enabled: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AlipayService.createPayment', () => {
  const baseOrder = { id: 'o1', tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', status: 'PENDING', amountCents: 1000, resource: 'AI', quantity: 100 };

  it('订单不存在抛 NotFound', async () => {
    const { svc } = makeService({ order: null });
    await expect(svc.createPayment(merchant, { orderId: 'o1', channel: 'PC' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('非本人订单抛 Forbidden', async () => {
    const { svc } = makeService({ order: { ...baseOrder, ownerId: 'other' } });
    await expect(svc.createPayment(merchant, { orderId: 'o1', channel: 'PC' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('非待支付订单抛 BadRequest', async () => {
    const { svc } = makeService({ order: { ...baseOrder, status: 'PAID' } });
    await expect(svc.createPayment(merchant, { orderId: 'o1', channel: 'PC' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('未启用支付宝抛 BadRequest', async () => {
    const { svc } = makeService({ order: baseOrder, configRow: { ...enabledRow, enabled: false } });
    await expect(svc.createPayment(merchant, { orderId: 'o1', channel: 'PC' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PC 渠道返回 payUrl', async () => {
    const { svc } = makeService({ order: baseOrder, configRow: enabledRow });
    pageExec.mockReturnValue('https://openapi.alipay.com/pay?x=1');
    const res = await svc.createPayment(merchant, { orderId: 'o1', channel: 'PC' });
    expect(res.payUrl).toBe('https://openapi.alipay.com/pay?x=1');
    expect(res.formHtml).toBeNull();
    expect(pageExec).toHaveBeenCalledWith('alipay.trade.page.pay', expect.objectContaining({
      bizContent: expect.objectContaining({ out_trade_no: 'o1', total_amount: '10.00' }),
    }));
  });

  it('WAP 渠道返回 formHtml', async () => {
    const { svc } = makeService({ order: baseOrder, configRow: enabledRow });
    pageExec.mockReturnValue('<form>...</form>');
    const res = await svc.createPayment(merchant, { orderId: 'o1', channel: 'WAP' });
    expect(res.formHtml).toBe('<form>...</form>');
    expect(res.payUrl).toBeNull();
    expect(pageExec).toHaveBeenCalledWith('alipay.trade.wap.pay', expect.anything());
  });
});

describe('AlipayService.handleNotify', () => {
  const order = { id: 'o1', tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', status: 'PENDING', amountCents: 1000, resource: 'AI', quantity: 100, payChannel: null };

  it('缺 out_trade_no 返回 failure', async () => {
    const { svc } = makeService();
    await expect(svc.handleNotify({})).resolves.toBe('failure');
  });

  it('订单不存在返回 failure', async () => {
    const { svc } = makeService({ order: null });
    await expect(svc.handleNotify({ out_trade_no: 'o1' })).resolves.toBe('failure');
  });

  it('验签失败返回 failure 不入账', async () => {
    const { svc, settleOrder } = makeService({ order, configRow: enabledRow });
    checkNotifySign.mockReturnValue(false);
    await expect(svc.handleNotify({ out_trade_no: 'o1', trade_status: 'TRADE_SUCCESS', total_amount: '10.00' })).resolves.toBe('failure');
    expect(settleOrder).not.toHaveBeenCalled();
  });

  it('金额被篡改返回 failure 不入账', async () => {
    const { svc, settleOrder } = makeService({ order, configRow: enabledRow });
    checkNotifySign.mockReturnValue(true);
    await expect(svc.handleNotify({ out_trade_no: 'o1', trade_status: 'TRADE_SUCCESS', total_amount: '99.00' })).resolves.toBe('failure');
    expect(settleOrder).not.toHaveBeenCalled();
  });

  it('非成功态(WAIT_BUYER_PAY)返回 success 但不入账', async () => {
    const { svc, settleOrder } = makeService({ order, configRow: enabledRow });
    checkNotifySign.mockReturnValue(true);
    await expect(svc.handleNotify({ out_trade_no: 'o1', trade_status: 'WAIT_BUYER_PAY', total_amount: '10.00' })).resolves.toBe('success');
    expect(settleOrder).not.toHaveBeenCalled();
  });

  it('验签通过+金额一致+TRADE_SUCCESS:入账并返回 success', async () => {
    const { svc, settleOrder } = makeService({ order, configRow: enabledRow });
    checkNotifySign.mockReturnValue(true);
    await expect(svc.handleNotify({ out_trade_no: 'o1', trade_status: 'TRADE_SUCCESS', total_amount: '10.00', trade_no: '2026XYZ' })).resolves.toBe('success');
    expect(settleOrder).toHaveBeenCalledWith(order, expect.objectContaining({ tradeNo: '2026XYZ' }));
  });
});
