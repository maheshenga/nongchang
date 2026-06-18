import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AuthUser, CreditResource, CreditOwnerType, BillingSummary,
  CreditAccountItem, LedgerQuery, PaginatedLedger, AllocateInput, RechargeInput,
  CreateCreditPlanInput, UpdateCreditPlanInput, CreditPlanView,
  CreateOrderInput, CreditOrderView, OrderQuery, PaginatedOrders,
} from '@nongchang/shared';
import { Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_OWNER_ID, BALANCE_FIELD } from './billing.constants';

interface ConsumeRef { refType?: string; refId?: string; operatorId?: string; note?: string }

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  // 按角色解析消费账户归属。缺归属 id fail-closed。
  private resolveConsumer(user: AuthUser): { ownerType: CreditOwnerType; ownerId: string } {
    if (user.role === Role.SYSTEM_ADMIN) return { ownerType: 'PLATFORM', ownerId: PLATFORM_OWNER_ID };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝计费');
      return { ownerType: 'AGENT', ownerId: user.agentId };
    }
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝计费');
      return { ownerType: 'MERCHANT', ownerId: user.ownerId };
    }
    throw new ForbiddenException('未知角色,拒绝计费');
  }

  async ensureAccount(ownerType: CreditOwnerType, ownerId: string, tenantId: string) {
    // 必须带 tenantId:PLATFORM 账户用固定 ownerId='PLATFORM',若漏 tenantId 会命中其它租户的平台账户造成串账。
    const found = await this.prisma.creditAccount.findFirst({ where: { tenantId, ownerType, ownerId } });
    if (found) return found;
    return this.prisma.creditAccount.create({ data: { ownerType, ownerId, tenantId } });
  }

  // 原子条件递减 + 写流水。余额不足抛 Forbidden(硬熔断)。
  async consume(user: AuthUser, resource: CreditResource, amount: number, ref: ConsumeRef) {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.creditAccount.updateMany({
        where: { id: acct.id, [field]: { gte: amount } },
        data: { [field]: { decrement: amount } },
      });
      if (upd.count === 0) {
        const label = resource === 'AI' ? 'AI 算力' : '二维码';
        throw new ForbiddenException(`${label}额度不足,请联系上级充值`);
      }
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      const balanceAfter = (after as any)[field] as number;
      await tx.creditLedger.create({
        data: {
          accountId: acct.id, resource, delta: -amount, balanceAfter, reason: 'CONSUME',
          refType: ref.refType ?? null, refId: ref.refId ?? null,
          operatorId: ref.operatorId ?? user.userId, note: ref.note ?? null,
        },
      });
      return { balanceAfter };
    });
  }

  // 退款:外部付费调用失败时把已扣额度原路退回 + 写 REFUND 流水。
  async refund(user: AuthUser, resource: CreditResource, amount: number, ref: ConsumeRef) {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    return this.prisma.$transaction(async (tx) => {
      await tx.creditAccount.updateMany({
        where: { id: acct.id },
        data: { [field]: { increment: amount } },
      });
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      const balanceAfter = (after as any)[field] as number;
      await tx.creditLedger.create({
        data: {
          accountId: acct.id, resource, delta: amount, balanceAfter, reason: 'REFUND',
          refType: ref.refType ?? null, refId: ref.refId ?? null,
          operatorId: ref.operatorId ?? user.userId, note: ref.note ?? null,
        },
      });
      return { balanceAfter };
    });
  }

  // 校验 target 下级在调用方范围内
  private async resolveTarget(user: AuthUser, targetOwnerType: 'AGENT' | 'MERCHANT', targetOwnerId: string) {
    if (user.role === Role.SYSTEM_ADMIN) {
      if (targetOwnerType !== 'AGENT') throw new ForbiddenException('平台仅可分配给代理商');
      const agent = await this.prisma.agent.findFirst({ where: { id: targetOwnerId, tenantId: user.tenantId }, select: { id: true } });
      if (!agent) throw new ForbiddenException('目标代理商不存在');
      return { ownerType: 'AGENT' as const, ownerId: targetOwnerId };
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
      if (targetOwnerType !== 'MERCHANT') throw new ForbiddenException('代理商仅可分配给旗下商户');
      const m = await this.prisma.user.findFirst({ where: { id: targetOwnerId, tenantId: user.tenantId, role: Role.MERCHANT, agentId: user.agentId }, select: { id: true } });
      if (!m) throw new ForbiddenException('目标商户不在管理范围');
      return { ownerType: 'MERCHANT' as const, ownerId: targetOwnerId };
    }
    throw new ForbiddenException('无分配权限');
  }

  async allocate(user: AuthUser, dto: AllocateInput) {
    const from = this.resolveConsumer(user);
    const fromAcct = await this.ensureAccount(from.ownerType, from.ownerId, user.tenantId);
    const target = await this.resolveTarget(user, dto.targetOwnerType, dto.targetOwnerId);
    const toAcct = await this.ensureAccount(target.ownerType, target.ownerId, user.tenantId);
    const field = BALANCE_FIELD[dto.resource];
    return this.prisma.$transaction(async (tx) => {
      const out = await tx.creditAccount.updateMany({
        where: { id: fromAcct.id, [field]: { gte: dto.amount } },
        data: { [field]: { decrement: dto.amount } },
      });
      if (out.count === 0) throw new ForbiddenException('可分配额度不足');
      const fromAfter = await tx.creditAccount.findUnique({ where: { id: fromAcct.id } });
      await tx.creditLedger.create({ data: { accountId: fromAcct.id, resource: dto.resource, delta: -dto.amount, balanceAfter: (fromAfter as any)[field], reason: 'ALLOCATE_OUT', operatorId: user.userId, refType: 'allocate', refId: toAcct.id } });
      await tx.creditAccount.updateMany({ where: { id: toAcct.id }, data: { [field]: { increment: dto.amount } } });
      const toAfter = await tx.creditAccount.findUnique({ where: { id: toAcct.id } });
      await tx.creditLedger.create({ data: { accountId: toAcct.id, resource: dto.resource, delta: dto.amount, balanceAfter: (toAfter as any)[field], reason: 'ALLOCATE_IN', operatorId: user.userId, refType: 'allocate', refId: fromAcct.id } });
      return { ok: true };
    });
  }

  async recharge(user: AuthUser, dto: RechargeInput) {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可充值');
    const acct = await this.ensureAccount('PLATFORM', PLATFORM_OWNER_ID, user.tenantId);
    const field = BALANCE_FIELD[dto.resource];
    return this.prisma.$transaction(async (tx) => {
      await tx.creditAccount.updateMany({ where: { id: acct.id }, data: { [field]: { increment: dto.amount } } });
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      await tx.creditLedger.create({ data: { accountId: acct.id, resource: dto.resource, delta: dto.amount, balanceAfter: (after as any)[field], reason: 'RECHARGE', operatorId: user.userId } });
      return { ok: true };
    });
  }

  async summary(user: AuthUser): Promise<BillingSummary> {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    return { ownerType, ownerId, aiBalance: acct.aiBalance, codeBalance: acct.codeBalance };
  }

  // 下级账户列表:平台看代理商;代理商看旗下商户;商户无下级返回空。
  async listAccounts(user: AuthUser): Promise<CreditAccountItem[]> {
    if (user.role === Role.SYSTEM_ADMIN) {
      const agents = await this.prisma.agent.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true } });
      return Promise.all(agents.map(async (a) => {
        const acc = await this.ensureAccount('AGENT', a.id, user.tenantId);
        return { id: acc.id, ownerType: 'AGENT' as const, ownerId: a.id, ownerName: a.name, aiBalance: acc.aiBalance, codeBalance: acc.codeBalance };
      }));
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
      const merchants = await this.prisma.user.findMany({ where: { tenantId: user.tenantId, role: Role.MERCHANT, agentId: user.agentId }, select: { id: true, displayName: true } });
      return Promise.all(merchants.map(async (m) => {
        const acc = await this.ensureAccount('MERCHANT', m.id, user.tenantId);
        return { id: acc.id, ownerType: 'MERCHANT' as const, ownerId: m.id, ownerName: m.displayName ?? m.id, aiBalance: acc.aiBalance, codeBalance: acc.codeBalance };
      }));
    }
    return [];
  }

  async ledger(user: AuthUser, query: LedgerQuery): Promise<PaginatedLedger> {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const where: any = { accountId: acct.id };
    if (query.resource) where.resource = query.resource;
    if (query.reason) where.reason = query.reason;
    const [rows, total] = await Promise.all([
      this.prisma.creditLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, resource: r.resource, delta: r.delta, balanceAfter: r.balanceAfter, reason: r.reason, refType: r.refType, refId: r.refId, note: r.note, createdAt: r.createdAt.toISOString() })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  // ===== 套餐管理(SYSTEM_ADMIN) =====

  async listPlans(user: AuthUser): Promise<CreditPlanView[]> {
    // 购买方(代理/商户)只看上架套餐;系统管理员看全部(含下架)以便管理。
    const where: any = { tenantId: user.tenantId };
    if (user.role !== Role.SYSTEM_ADMIN) where.active = true;
    const plans = await this.prisma.creditPlan.findMany({ where, orderBy: { createdAt: 'asc' } });
    return plans.map((p) => this.toPlanView(p));
  }

  async createPlan(user: AuthUser, dto: CreateCreditPlanInput): Promise<CreditPlanView> {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可管理套餐');
    const created = await this.prisma.creditPlan.create({
      data: {
        tenantId: user.tenantId, name: dto.name, resource: dto.resource,
        quantity: dto.quantity, priceCents: dto.priceCents, isUnit: dto.isUnit, active: dto.active,
      },
    });
    return this.toPlanView(created);
  }

  async updatePlan(user: AuthUser, id: string, dto: UpdateCreditPlanInput): Promise<CreditPlanView> {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可管理套餐');
    const found = await this.prisma.creditPlan.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!found) throw new NotFoundException('套餐不存在');
    const updated = await this.prisma.creditPlan.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name } : {}),
        ...(dto.resource != null ? { resource: dto.resource } : {}),
        ...(dto.quantity != null ? { quantity: dto.quantity } : {}),
        ...(dto.priceCents != null ? { priceCents: dto.priceCents } : {}),
        ...(dto.isUnit != null ? { isUnit: dto.isUnit } : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
    });
    return this.toPlanView(updated);
  }

  async removePlan(user: AuthUser, id: string) {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可管理套餐');
    const found = await this.prisma.creditPlan.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!found) throw new NotFoundException('套餐不存在');
    const orderCount = await this.prisma.creditOrder.count({ where: { planId: id } });
    // 已有订单引用的套餐不可硬删(FK Restrict),改为下架,保留历史订单可追溯。
    if (orderCount > 0) {
      await this.prisma.creditPlan.update({ where: { id }, data: { active: false } });
      return { id, archived: true };
    }
    await this.prisma.creditPlan.delete({ where: { id } });
    return { id, archived: false };
  }

  private toPlanView(p: any): CreditPlanView {
    return {
      id: p.id, name: p.name, resource: p.resource, quantity: p.quantity,
      priceCents: p.priceCents, isUnit: p.isUnit, active: p.active,
      createdAt: p.createdAt.toISOString(),
    };
  }

  // ===== 自助购买(AGENT_ADMIN / MERCHANT 进自己账户) =====

  // 仅代理商/商户可购买进自己账户;平台无上级故不自助购买。
  private resolveBuyer(user: AuthUser): { ownerType: CreditOwnerType; ownerId: string } {
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝购买');
      return { ownerType: 'AGENT', ownerId: user.agentId };
    }
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝购买');
      return { ownerType: 'MERCHANT', ownerId: user.ownerId };
    }
    throw new ForbiddenException('当前角色不支持自助购买额度');
  }

  async createOrder(user: AuthUser, dto: CreateOrderInput): Promise<CreditOrderView> {
    const buyer = this.resolveBuyer(user);
    let resource: CreditResource;
    let quantity: number;
    let amountCents: number;
    let planId: string | null = null;
    let planName: string | null = null;

    if (dto.planId) {
      const plan = await this.prisma.creditPlan.findFirst({ where: { id: dto.planId, tenantId: user.tenantId, active: true } });
      if (!plan) throw new NotFoundException('套餐不存在或已下架');
      planId = plan.id;
      planName = plan.name;
      resource = plan.resource;
      if (plan.isUnit) {
        // 单价基准套餐用于自定义,不应直接整单购买;但若直接下单则按 1 个基准单位计。
        quantity = plan.quantity;
        amountCents = plan.priceCents;
      } else {
        quantity = plan.quantity;
        amountCents = plan.priceCents;
      }
    } else {
      // 自定义数量:按该资源的单价基准套餐(isUnit=true)计价。
      resource = dto.resource!;
      quantity = dto.quantity!;
      const unit = await this.prisma.creditPlan.findFirst({
        where: { tenantId: user.tenantId, resource, isUnit: true, active: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!unit) throw new BadRequestException('该资源未配置单价,无法自定义购买');
      if (unit.quantity <= 0) throw new BadRequestException('单价基准配置非法');
      // 单价 = priceCents / quantity(每基准单位价),金额向上取整到分。
      amountCents = Math.ceil((unit.priceCents * quantity) / unit.quantity);
    }

    const order = await this.prisma.creditOrder.create({
      data: {
        tenantId: user.tenantId, ownerType: buyer.ownerType, ownerId: buyer.ownerId,
        planId, resource, quantity, amountCents, status: 'PENDING', buyerId: user.userId,
      },
    });
    return this.toOrderView(order, planName);
  }

  // 兜底支付(标记已支付即入账,不经真实支付渠道)。幂等——仅 PENDING→PAID 时入账,重复调用不二次入账。
  // 安全闸门:仅当 ALLOW_MANUAL_PAY=true 时允许,默认关闭。生产环境禁用以杜绝绕过支付直接入账;
  // 本地联调(小程序暂无真实支付)在 .env 置 true 放行。
  async payOrder(user: AuthUser, id: string): Promise<CreditOrderView> {
    if (process.env.ALLOW_MANUAL_PAY !== 'true') {
      throw new ForbiddenException('当前环境未开放免支付入账,请通过支付宝完成支付');
    }
    const buyer = this.resolveBuyer(user);
    const order = await this.prisma.creditOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!order) throw new NotFoundException('订单不存在');
    // 归属校验:只能支付自己账户的订单。
    if (order.ownerType !== buyer.ownerType || order.ownerId !== buyer.ownerId) {
      throw new ForbiddenException('无权支付该订单');
    }
    if (order.status === 'CANCELLED') throw new BadRequestException('订单已取消');
    const updated = await this.settleOrder(order, { operatorId: user.userId, payChannel: 'manual' });
    const planName = updated?.planId
      ? (await this.prisma.creditPlan.findUnique({ where: { id: updated.planId }, select: { name: true } }))?.name ?? null
      : null;
    return this.toOrderView(updated, planName);
  }

  // 取消订单:仅本人 PENDING 订单可取消(原子 PENDING→CANCELLED)。已支付不可取消。
  async cancelOrder(user: AuthUser, id: string): Promise<CreditOrderView> {
    const buyer = this.resolveBuyer(user);
    const order = await this.prisma.creditOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.ownerType !== buyer.ownerType || order.ownerId !== buyer.ownerId) {
      throw new ForbiddenException('无权操作该订单');
    }
    if (order.status === 'PAID') throw new BadRequestException('订单已支付,不可取消');
    const flip = await this.prisma.creditOrder.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (flip.count === 0) throw new BadRequestException('订单当前状态不可取消');
    const fresh = await this.prisma.creditOrder.findUnique({ where: { id }, include: { plan: { select: { name: true } } } });
    return this.toOrderView(fresh, (fresh as any)?.plan?.name ?? null);
  }

  /** 共用入账:对一个订单行原子地 PENDING→PAID 并把额度记入对应账户 + 写 PURCHASE 流水。
   *  幂等:仅当订单仍为 PENDING 时入账;已 PAID(或并发)直接返回当前行不二次入账。
   *  供管理员兜底支付与支付宝回调共用——回调侧不持有 AuthUser,故按订单行自身归属入账。 */
  async settleOrder(order: { id: string; tenantId: string; ownerType: string; ownerId: string; resource: string; quantity: number }, meta: { operatorId?: string; payChannel?: string; tradeNo?: string }) {
    const field = BALANCE_FIELD[order.resource as CreditResource];
    const acct = await this.ensureAccount(order.ownerType as CreditOwnerType, order.ownerId, order.tenantId);
    return this.prisma.$transaction(async (tx) => {
      const flip = await tx.creditOrder.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'PAID', paidAt: new Date(), payChannel: meta.payChannel ?? null, tradeNo: meta.tradeNo ?? null },
      });
      if (flip.count === 0) {
        return tx.creditOrder.findUnique({ where: { id: order.id } });
      }
      await tx.creditAccount.updateMany({ where: { id: acct.id }, data: { [field]: { increment: order.quantity } } });
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      await tx.creditLedger.create({
        data: {
          accountId: acct.id, resource: order.resource as CreditResource, delta: order.quantity,
          balanceAfter: (after as any)[field], reason: 'PURCHASE',
          refType: 'order', refId: order.id, operatorId: meta.operatorId ?? null,
        },
      });
      return tx.creditOrder.findUnique({ where: { id: order.id } });
    });
  }

  async listOrders(user: AuthUser, query: OrderQuery): Promise<PaginatedOrders> {
    const buyer = this.resolveBuyer(user);
    const where: any = { tenantId: user.tenantId, ownerType: buyer.ownerType, ownerId: buyer.ownerId };
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      this.prisma.creditOrder.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { plan: { select: { name: true } } },
      }),
      this.prisma.creditOrder.count({ where }),
    ]);
    return {
      items: rows.map((r: any) => this.toOrderView(r, r.plan?.name ?? null)),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  private toOrderView(o: any, planName: string | null): CreditOrderView {
    return {
      id: o.id, ownerType: o.ownerType, ownerId: o.ownerId,
      planId: o.planId ?? null, planName,
      resource: o.resource, quantity: o.quantity, amountCents: o.amountCents,
      status: o.status, paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
    };
  }
}
