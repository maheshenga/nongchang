import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthUser, CreditResource, CreditOwnerType, BillingSummary,
  CreditAccountItem, LedgerQuery, PaginatedLedger, AllocateInput, RechargeInput,
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
    const found = await this.prisma.creditAccount.findFirst({ where: { ownerType, ownerId } });
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
}
