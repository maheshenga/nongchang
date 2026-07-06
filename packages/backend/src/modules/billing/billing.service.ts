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

interface ConsumeRef { refType?: string; refId?: string; operatorId?: string; note?: string; idempotencyKey?: string }
interface ReservationResult { reservationId: string; balanceAfter: number }
interface StaleReservationQuery {
  olderThanMinutes?: number;
  now?: Date;
  take?: number;
  dryRun?: boolean;
  resource?: CreditResource;
  refType?: string;
}
interface StaleReservationItem {
  id: string;
  tenantId: string;
  accountId: string;
  ownerType: CreditOwnerType;
  ownerId: string;
  resource: CreditResource;
  amount: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  idempotencyKey: string;
  operatorId: string | null;
  createdAt: string;
}
interface ReservationRecoveryResult {
  scanned: number;
  released: number;
  skipped: number;
  errors: { reservationId: string; message: string }[];
}

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
    // 用原子 upsert 避免并发首触时先查后建的重复创建竞态。
    return this.prisma.creditAccount.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId, ownerType, ownerId } },
      create: { ownerType, ownerId, tenantId },
      update: {},
    });
  }

  // 原子条件递减 + 写流水。余额不足抛 Forbidden(硬熔断)。
  async consume(user: AuthUser, resource: CreditResource, amount: number, ref: ConsumeRef) {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    return this.prisma.$transaction(async (tx) => {
      if (ref.idempotencyKey) {
        const existing = await tx.creditLedger.findFirst({
          where: { accountId: acct.id, reason: 'CONSUME', idempotencyKey: ref.idempotencyKey },
          select: { balanceAfter: true },
        });
        if (existing) return { balanceAfter: existing.balanceAfter };
      }
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
          idempotencyKey: ref.idempotencyKey ?? null,
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

  async reserve(user: AuthUser, resource: CreditResource, amount: number, ref: ConsumeRef): Promise<ReservationResult> {
    const idempotencyKey = ref.idempotencyKey;
    if (!idempotencyKey) throw new BadRequestException('缺少幂等键,无法预约额度');
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditReservation.findFirst({
          where: { accountId: acct.id, resource, idempotencyKey },
          select: { id: true, status: true, amount: true, balanceAfter: true },
        });
        if (existing) {
          if (existing.status === 'RELEASED') throw new BadRequestException('预约已释放,不可重复使用该幂等键');
          if (existing.amount !== amount) throw new BadRequestException('预约额度与当前请求额度不一致');
          return { reservationId: existing.id, balanceAfter: existing.balanceAfter };
        }
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
        const reservation = await tx.creditReservation.create({
          data: {
            tenantId: user.tenantId,
            accountId: acct.id,
            resource,
            amount,
            balanceAfter,
            status: 'RESERVED',
            refType: ref.refType ?? null,
            refId: ref.refId ?? null,
            operatorId: ref.operatorId ?? user.userId,
            note: ref.note ?? null,
            idempotencyKey,
          },
        });
        await tx.creditLedger.create({
          data: {
            accountId: acct.id, resource, delta: -amount, balanceAfter, reason: 'RESERVED',
            refType: ref.refType ?? null, refId: ref.refId ?? null,
            operatorId: ref.operatorId ?? user.userId, note: ref.note ?? null,
            idempotencyKey,
          },
        });
        return { reservationId: reservation.id, balanceAfter };
      });
    } catch (err) {
      if ((err as any)?.code === 'P2002') {
        const existing = await this.prisma.creditReservation.findFirst({
          where: { accountId: acct.id, resource, idempotencyKey },
          select: { id: true, status: true, amount: true, balanceAfter: true },
        });
        if (existing && existing.status !== 'RELEASED' && existing.amount === amount) {
          return { reservationId: existing.id, balanceAfter: existing.balanceAfter };
        }
      }
      throw err;
    }
  }

  async confirmReservation(user: AuthUser, resource: CreditResource, ref: ConsumeRef): Promise<ReservationResult> {
    const idempotencyKey = ref.idempotencyKey;
    if (!idempotencyKey) throw new BadRequestException('缺少幂等键,无法确认预约');
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    return this.prisma.$transaction(async (tx) => {
      const existingConfirm = await tx.creditLedger.findFirst({
        where: { accountId: acct.id, reason: 'CONFIRMED', idempotencyKey },
        select: { balanceAfter: true },
      });
      const reservation = await tx.creditReservation.findFirst({
        where: { accountId: acct.id, resource, idempotencyKey },
        select: { id: true, status: true, balanceAfter: true },
      });
      if (!reservation) throw new BadRequestException('预约记录不存在,无法确认扣费');
      if (reservation.status === 'RELEASED') throw new BadRequestException('预约已释放,无法确认扣费');
      if (existingConfirm) return { reservationId: reservation.id, balanceAfter: existingConfirm.balanceAfter };
      if (reservation.status === 'RESERVED') {
        const flip = await tx.creditReservation.updateMany({
          where: { id: reservation.id, status: 'RESERVED' },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
        if (flip.count === 0) {
          const existing = await tx.creditLedger.findFirst({
            where: { accountId: acct.id, reason: 'CONFIRMED', idempotencyKey },
            select: { balanceAfter: true },
          });
          if (existing) return { reservationId: reservation.id, balanceAfter: existing.balanceAfter };
          throw new BadRequestException('预约状态已变化,无法确认扣费');
        }
      }
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      const balanceAfter = (after as any)[field] as number;
      try {
        await tx.creditLedger.create({
          data: {
            accountId: acct.id, resource, delta: 0, balanceAfter, reason: 'CONFIRMED',
            refType: ref.refType ?? null, refId: ref.refId ?? null,
            operatorId: ref.operatorId ?? user.userId, note: ref.note ?? null,
            idempotencyKey,
          },
        });
      } catch (err) {
        if ((err as any)?.code !== 'P2002') throw err;
        const existing = await tx.creditLedger.findFirst({
          where: { accountId: acct.id, reason: 'CONFIRMED', idempotencyKey },
          select: { balanceAfter: true },
        });
        if (!existing) throw err;
        return { reservationId: reservation.id, balanceAfter: existing.balanceAfter };
      }
      return { reservationId: reservation.id, balanceAfter };
    });
  }

  async releaseReservation(user: AuthUser, resource: CreditResource, amount: number, ref: ConsumeRef): Promise<ReservationResult> {
    const idempotencyKey = ref.idempotencyKey;
    if (!idempotencyKey) throw new BadRequestException('缺少幂等键,无法释放预约');
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findFirst({
        where: { accountId: acct.id, resource, idempotencyKey },
        select: { id: true, status: true, amount: true, balanceAfter: true },
      });
      if (!reservation) throw new BadRequestException('预约记录不存在,无法释放额度');
      if (reservation.status === 'CONFIRMED') throw new BadRequestException('预约已确认,无法释放额度');
      const existingRelease = await tx.creditLedger.findFirst({
        where: { accountId: acct.id, reason: 'RELEASED', idempotencyKey },
        select: { balanceAfter: true },
      });
      if (existingRelease || reservation.status === 'RELEASED') {
        return { reservationId: reservation.id, balanceAfter: existingRelease?.balanceAfter ?? reservation.balanceAfter };
      }
      if (amount !== reservation.amount) throw new BadRequestException('释放额度与预约额度不一致');
      const flip = await tx.creditReservation.updateMany({
        where: { id: reservation.id, status: 'RESERVED' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      if (flip.count === 0) throw new BadRequestException('预约状态已变化,无法释放额度');
      await tx.creditAccount.updateMany({
        where: { id: acct.id },
        data: { [field]: { increment: reservation.amount } },
      });
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      const balanceAfter = (after as any)[field] as number;
      await tx.creditLedger.create({
        data: {
          accountId: acct.id, resource, delta: reservation.amount, balanceAfter, reason: 'RELEASED',
          refType: ref.refType ?? null, refId: ref.refId ?? null,
          operatorId: ref.operatorId ?? user.userId, note: ref.note ?? null,
          idempotencyKey,
        },
      });
      return { reservationId: reservation.id, balanceAfter };
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

  private staleReservationCutoff(query: StaleReservationQuery): Date {
    const minutes = query.olderThanMinutes ?? 60;
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new BadRequestException('olderThanMinutes must be a positive number');
    }
    const now = query.now ?? new Date();
    return new Date(now.getTime() - minutes * 60_000);
  }

  private staleReservationTake(query: StaleReservationQuery): number {
    const take = query.take ?? 100;
    if (!Number.isInteger(take) || take <= 0 || take > 1000) {
      throw new BadRequestException('take must be an integer between 1 and 1000');
    }
    return take;
  }

  private staleReservationWhere(query: StaleReservationQuery) {
    return {
      status: 'RESERVED' as const,
      createdAt: { lt: this.staleReservationCutoff(query) },
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.refType ? { refType: query.refType } : {}),
    };
  }

  async listStaleReservations(query: StaleReservationQuery = {}): Promise<StaleReservationItem[]> {
    const rows = await this.prisma.creditReservation.findMany({
      where: this.staleReservationWhere(query),
      orderBy: { createdAt: 'asc' },
      take: this.staleReservationTake(query),
      select: {
        id: true,
        tenantId: true,
        accountId: true,
        resource: true,
        amount: true,
        balanceAfter: true,
        refType: true,
        refId: true,
        idempotencyKey: true,
        operatorId: true,
        createdAt: true,
        account: { select: { ownerType: true, ownerId: true } },
      },
    });
    return rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      accountId: row.accountId,
      ownerType: row.account.ownerType,
      ownerId: row.account.ownerId,
      resource: row.resource,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      refType: row.refType,
      refId: row.refId,
      idempotencyKey: row.idempotencyKey,
      operatorId: row.operatorId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async releaseStaleReservations(query: StaleReservationQuery = {}): Promise<ReservationRecoveryResult> {
    const candidates = await this.listStaleReservations(query);
    const result: ReservationRecoveryResult = { scanned: candidates.length, released: 0, skipped: 0, errors: [] };
    if (query.dryRun) {
      result.skipped = candidates.length;
      return result;
    }
    for (const candidate of candidates) {
      try {
        const released = await this.releaseReservedReservationById(candidate.id);
        if (released) result.released += 1;
        else result.skipped += 1;
      } catch (err) {
        result.errors.push({ reservationId: candidate.id, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  private async releaseReservedReservationById(reservationId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          accountId: true,
          resource: true,
          amount: true,
          status: true,
          refType: true,
          refId: true,
          idempotencyKey: true,
        },
      });
      if (!reservation || reservation.status !== 'RESERVED') return false;
      const existingTerminalLedger = await tx.creditLedger.findFirst({
        where: {
          accountId: reservation.accountId,
          reason: { in: ['CONFIRMED', 'RELEASED'] },
          idempotencyKey: reservation.idempotencyKey,
        },
        select: { id: true },
      });
      if (existingTerminalLedger) {
        throw new BadRequestException('inconsistent reservation: RESERVED row already has terminal ledger');
      }
      const flip = await tx.creditReservation.updateMany({
        where: { id: reservation.id, status: 'RESERVED' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      if (flip.count === 0) return false;
      const field = BALANCE_FIELD[reservation.resource as CreditResource];
      await tx.creditAccount.updateMany({
        where: { id: reservation.accountId },
        data: { [field]: { increment: reservation.amount } },
      });
      const after = await tx.creditAccount.findUnique({ where: { id: reservation.accountId } });
      const balanceAfter = (after as any)[field] as number;
      await tx.creditLedger.create({
        data: {
          accountId: reservation.accountId,
          resource: reservation.resource as CreditResource,
          delta: reservation.amount,
          balanceAfter,
          reason: 'RELEASED',
          refType: reservation.refType ?? null,
          refId: reservation.refId ?? null,
          operatorId: 'system:reservation-recovery',
          note: 'stale reservation recovery',
          idempotencyKey: reservation.idempotencyKey,
        },
      });
      return true;
    });
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
      const balances = await this.loadBalances('AGENT', agents.map((a) => a.id), user.tenantId);
      return agents.map((a) => {
        const b = balances.get(a.id);
        return { id: b?.id ?? `pending:AGENT:${a.id}`, ownerType: 'AGENT' as const, ownerId: a.id, ownerName: a.name, aiBalance: b?.aiBalance ?? 0, codeBalance: b?.codeBalance ?? 0 };
      });
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
      const merchants = await this.prisma.user.findMany({ where: { tenantId: user.tenantId, role: Role.MERCHANT, agentId: user.agentId }, select: { id: true, displayName: true } });
      const balances = await this.loadBalances('MERCHANT', merchants.map((m) => m.id), user.tenantId);
      return merchants.map((m) => {
        const b = balances.get(m.id);
        return { id: b?.id ?? `pending:MERCHANT:${m.id}`, ownerType: 'MERCHANT' as const, ownerId: m.id, ownerName: m.displayName ?? m.id, aiBalance: b?.aiBalance ?? 0, codeBalance: b?.codeBalance ?? 0 };
      });
    }
    return [];
  }

  // 批量取一组下级账户余额,一次 findMany(ownerId in [...]) 取代逐个 ensureAccount(消除 N+1)。
  // 从未触账的下级此前无 CreditAccount 行,展示按 0/0 处理(账户行在其首次充值/消费时惰性创建)。
  private async loadBalances(ownerType: CreditOwnerType, ownerIds: string[], tenantId: string) {
    if (ownerIds.length === 0) return new Map<string, { id: string; aiBalance: number; codeBalance: number }>();
    const rows = await this.prisma.creditAccount.findMany({
      where: { tenantId, ownerType, ownerId: { in: ownerIds } },
      select: { id: true, ownerId: true, aiBalance: true, codeBalance: true },
    });
    return new Map(rows.map((r) => [r.ownerId, { id: r.id, aiBalance: r.aiBalance, codeBalance: r.codeBalance }]));
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
    // 已取消订单显式拒绝:本检查是 best-effort UX 提示(非安全边界)。
    // 该读与下方 settleOrder 之间存在 TOCTOU 窗口——若并发取消先于此处写入,
    // settleOrder 仍会入账(语义上"付款强于取消"无资金风险)。
    // 生产环境 payOrder 已被 ALLOW_MANUAL_PAY 闸门拦截,故仅本地联调受影响。
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

  /** 共用入账:对一个订单行原子地 →PAID 并把额度记入对应账户 + 写 PURCHASE 流水。
   *  入账条件:订单仍为 PENDING(正常),或 CANCELLED(支付宝回调证明用户已真实付款,
   *  但本地在回调到达前/并发已把订单取消)。回调验签+金额校验通过即为权威付款凭证,
   *  据此对已取消订单补入账,杜绝"钱已收、额度不到账"的丢钱竞态(回调赢得竞态)。
   *  幂等:已 PAID(或并发)直接返回当前行不二次入账。
   *  注:管理员兜底支付 payOrder 在调用本方法前已显式拒绝 CANCELLED 订单,
   *  故"补入账已取消订单"仅经支付宝回调发生——只有真实付款凭证能让取消订单复活。
   *  供管理员兜底支付与支付宝回调共用——回调侧不持有 AuthUser,故按订单行自身归属入账。 */
  async settleOrder(order: { id: string; tenantId: string; ownerType: string; ownerId: string; resource: string; quantity: number }, meta: { operatorId?: string; payChannel?: string; tradeNo?: string }) {
    const field = BALANCE_FIELD[order.resource as CreditResource];
    const acct = await this.ensureAccount(order.ownerType as CreditOwnerType, order.ownerId, order.tenantId);
    return this.prisma.$transaction(async (tx) => {
      const flip = await tx.creditOrder.updateMany({
        where: { id: order.id, status: { in: ['PENDING', 'CANCELLED'] } },
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
