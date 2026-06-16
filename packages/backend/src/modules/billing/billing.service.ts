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
    const found = await this.prisma.creditAccount.findUnique({ where: { ownerType_ownerId: { ownerType, ownerId } } });
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
}
