import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import AlipaySdk from 'alipay-sdk';
import { Role } from '@nongchang/shared';
import type { AuthUser, AlipayConfigInput, AlipayConfigView, CreatePaymentInput, PaymentView } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { BillingService } from './billing.service';

const PROVIDER = 'alipay';
// 复用 IntegrationConfig 列:app_id=支付宝appId、secret_enc=应用私钥密文、api_key_enc=支付宝公钥密文。
interface AlipayRow {
  appId: string | null;
  secretEnc: string | null;   // 应用私钥
  apiKeyEnc: string | null;   // 支付宝公钥
  enabled: boolean;
}

@Injectable()
export class AlipayService {
  constructor(
    private prisma: PrismaService,
    private enc: EncryptionService,
    private billing: BillingService,
  ) {}

  private async findRow(tenantId: string): Promise<AlipayRow | null> {
    return (await this.prisma.integrationConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
    })) as AlipayRow | null;
  }

  async getConfig(user: AuthUser): Promise<AlipayConfigView | null> {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可查看支付配置');
    const row = await this.findRow(user.tenantId);
    if (!row) return null;
    return {
      appId: row.appId ?? null,
      privateKeyMasked: row.secretEnc ? '已配置(已加密)' : null,
      alipayPublicKeyMasked: row.apiKeyEnc ? '已配置(已加密)' : null,
      enabled: row.enabled,
    };
  }

  async upsertConfig(user: AuthUser, dto: AlipayConfigInput): Promise<AlipayConfigView> {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可配置支付');
    const existing = await this.findRow(user.tenantId);
    if (!existing && (!dto.privateKey || !dto.alipayPublicKey)) {
      throw new BadRequestException('首次配置需提供应用私钥与支付宝公钥');
    }
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    const secretEnc = dto.privateKey ? this.enc.encrypt(dto.privateKey) : undefined;
    const apiKeyEnc = dto.alipayPublicKey ? this.enc.encrypt(dto.alipayPublicKey) : undefined;

    const update: Record<string, unknown> = { appId: dto.appId, enabled };
    if (secretEnc) update.secretEnc = secretEnc;
    if (apiKeyEnc) update.apiKeyEnc = apiKeyEnc;

    await this.prisma.integrationConfig.upsert({
      where: { tenantId_provider: { tenantId: user.tenantId, provider: PROVIDER } },
      create: { tenantId: user.tenantId, provider: PROVIDER, appId: dto.appId, secretEnc: secretEnc ?? null, apiKeyEnc: apiKeyEnc ?? null, enabled },
      update,
    });
    return (await this.getConfig(user))!;
  }

  // 实例化某租户的 AlipaySdk(解密私钥/公钥)。未配置或未启用则抛错。
  private async sdkFor(tenantId: string): Promise<AlipaySdk> {
    const row = await this.findRow(tenantId);
    if (!row || !row.enabled || !row.appId || !row.secretEnc || !row.apiKeyEnc) {
      throw new BadRequestException('本租户未启用支付宝支付,请联系管理员配置');
    }
    return new AlipaySdk({
      appId: row.appId,
      privateKey: this.enc.decrypt(row.secretEnc),
      alipayPublicKey: this.enc.decrypt(row.apiKeyEnc),
      gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
      signType: 'RSA2',
    });
  }

  // 发起支付:对 PENDING 订单按渠道生成支付宝支付入口(PC 返回跳转 URL / WAP 返回表单 HTML)。
  async createPayment(user: AuthUser, dto: CreatePaymentInput): Promise<PaymentView> {
    const order = await this.prisma.creditOrder.findFirst({ where: { id: dto.orderId, tenantId: user.tenantId } });
    if (!order) throw new NotFoundException('订单不存在');
    // 归属校验:只能为自己账户的订单付款。
    const buyer = this.resolveBuyer(user);
    if (order.ownerType !== buyer.ownerType || order.ownerId !== buyer.ownerId) {
      throw new ForbiddenException('无权支付该订单');
    }
    if (order.status !== 'PENDING') throw new BadRequestException('该订单不可支付(非待支付状态)');

    const sdk = await this.sdkFor(user.tenantId);
    const method = dto.channel === 'PC' ? 'alipay.trade.page.pay' : 'alipay.trade.wap.pay';
    const productCode = dto.channel === 'PC' ? 'FAST_INSTANT_TRADE_PAY' : 'QUICK_WAP_WAY';
    const notifyUrl = `${this.publicBaseUrl()}/api/billing/alipay/notify`;
    const returnUrl = `${this.webBaseUrl()}/#/billing/pay-result?orderId=${order.id}`;
    const subject = `额度购买-${order.resource === 'AI' ? 'AI算力' : '二维码'}-${order.quantity}`;

    // out_trade_no = 订单 id(回调按此定位订单);total_amount 单位元,保留两位。
    // timeout_express=30m:逾期未支付支付宝自动关单,避免 PENDING 订单永久可支付。
    const params = {
      notify_url: notifyUrl,
      return_url: returnUrl,
      bizContent: {
        out_trade_no: order.id,
        total_amount: (order.amountCents / 100).toFixed(2),
        subject,
        product_code: productCode,
        timeout_express: '30m',
      },
      method: dto.channel === 'PC' ? 'GET' : 'POST',
    } as const;

    const result = sdk.pageExec(method, params as any);
    // PC(GET)返回可跳转 URL;WAP(POST)返回自动提交表单 HTML。
    return {
      orderId: order.id,
      channel: dto.channel,
      payUrl: dto.channel === 'PC' ? result : null,
      formHtml: dto.channel === 'WAP' ? result : null,
    };
  }

  // 支付宝异步通知:验签 → 校验订单/金额/交易状态 → 幂等入账。返回给控制器决定响应文本。
  async handleNotify(tenantHintBody: Record<string, string>): Promise<'success' | 'failure'> {
    const out = tenantHintBody.out_trade_no;
    if (!out) return 'failure';
    const order = await this.prisma.creditOrder.findUnique({ where: { id: out } });
    if (!order) return 'failure';

    // 用订单所属租户的支付宝公钥验签(回调无 JWT,验签是唯一信任来源)。
    let sdk: AlipaySdk;
    try {
      sdk = await this.sdkFor(order.tenantId);
    } catch {
      return 'failure';
    }
    // app_id 纵深校验:回调声明的 app_id 必须等于本租户配置的 appId。
    // 验签已用本租户公钥挡掉大部分伪造,此处再防密钥配置错位/跨 app 串单(支付宝官方建议校验)。
    const cfgRow = await this.findRow(order.tenantId);
    const notifyAppId = tenantHintBody.app_id;
    if (notifyAppId && cfgRow?.appId && notifyAppId !== cfgRow.appId) {
      return 'failure';
    }
    let ok: boolean;
    try {
      ok = sdk.checkNotifySign(tenantHintBody);
    } catch {
      ok = false;
    }
    if (!ok) return 'failure';

    // 仅处理交易成功/完成。
    const status = tenantHintBody.trade_status;
    if (status !== 'TRADE_SUCCESS' && status !== 'TRADE_FINISHED') {
      return 'success'; // 验签通过但非成功态(如 WAIT_BUYER_PAY):应答 success 避免支付宝重试,不入账。
    }
    // 金额防篡改:回调金额必须与订单一致。
    const paidYuan = Number(tenantHintBody.total_amount);
    if (!Number.isFinite(paidYuan) || Math.round(paidYuan * 100) !== order.amountCents) {
      return 'failure';
    }
    const channel = order.payChannel ?? 'alipay';
    await this.billing.settleOrder(order, { payChannel: channel, tradeNo: tenantHintBody.trade_no });
    return 'success';
  }

  private resolveBuyer(user: AuthUser): { ownerType: 'AGENT' | 'MERCHANT'; ownerId: string } {
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
      return { ownerType: 'AGENT', ownerId: user.agentId };
    }
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId');
      return { ownerType: 'MERCHANT', ownerId: user.ownerId };
    }
    throw new ForbiddenException('当前角色不支持支付');
  }

  private publicBaseUrl(): string {
    const u = process.env.PUBLIC_BASE_URL;
    if (!u) throw new BadRequestException('未配置 PUBLIC_BASE_URL(支付宝回调地址),无法发起支付');
    return u.replace(/\/$/, '');
  }

  private webBaseUrl(): string {
    return (process.env.WEB_BASE_URL || '').replace(/\/$/, '');
  }
}
