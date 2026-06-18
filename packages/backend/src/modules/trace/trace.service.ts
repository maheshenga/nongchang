import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateTraceEventDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { BillingService } from '../billing/billing.service';

const MAX_CODES_PER_BATCH = 10000;

@Injectable()
export class TraceService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private billing: BillingService) {}

  /** 一物一码:为批次批量生成 count 个唯一溯源码并返回。 */
  async generateCodes(user: AuthUser, batchId: string, count = 1) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
      throw new ForbiddenException(`生成数量须为 1~${MAX_CODES_PER_BATCH} 的整数`);
    }
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const ref = { refType: 'trace.generate', refId: batchId };
    // 先扣额度(余额不足直接 403 短路);建码失败则退还,避免「扣了费但没生成码」。
    await this.billing.consume(user, 'CODE', count, ref);
    try {
      const codes = Array.from({ length: count }, () => `ORC-${randomUUID().slice(0, 12).toUpperCase()}`);
      await this.prisma.traceCode.createMany({
        data: codes.map((code) => ({ tenantId: user.tenantId, batchId, code })),
      });
      return await this.prisma.traceCode.findMany({ where: { tenantId: user.tenantId, code: { in: codes } } });
    } catch (err) {
      await this.billing.refund(user, 'CODE', count, ref);
      throw err;
    }
  }

  async addEvent(user: AuthUser, dto: CreateTraceEventDto) {
    await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
    return this.prisma.traceEvent.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, type: dto.type, title: dto.title,
        actor: dto.actor, location: dto.location, occurredAt: new Date(dto.occurredAt),
        payload: (dto.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listEvents(user: AuthUser, batchId: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    return this.prisma.traceEvent.findMany({
      where: { tenantId: user.tenantId, batchId }, orderBy: { occurredAt: 'asc' },
    });
  }

  /** 列出批次已生成的全部溯源码(含各自扫码次数),最新在前。 */
  async listCodes(user: AuthUser, batchId: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    return this.prisma.traceCode.findMany({
      where: { tenantId: user.tenantId, batchId }, orderBy: { createdAt: 'desc' },
    });
  }
}
