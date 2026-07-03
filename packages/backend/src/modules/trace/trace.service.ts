import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateTraceEventDto, ListQuery, Paginated } from '@nongchang/shared';
import { isPaginated } from '@nongchang/shared';
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
    const ref = {
      refType: 'trace.generate',
      refId: batchId,
      idempotencyKey: `trace.generate:${user.tenantId}:${user.userId}:${batchId}:${count}`,
    };
    // 先扣额度(余额不足直接 403 短路);建码失败则退还,避免「扣了费但没生成码」。
    await this.billing.consume(user, 'CODE', count, ref);
    const codes = Array.from({ length: count }, () => `ORC-${randomUUID().slice(0, 12).toUpperCase()}`);
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM batches WHERE id = ${batchId} FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundException('批次不存在');
        await tx.traceCode.createMany({
          data: codes.map((code) => ({ tenantId: user.tenantId, batchId, code })),
        });
      });
    } catch (err) {
      await this.billing.refund(user, 'CODE', count, ref);
      throw err;
    }
    return this.prisma.traceCode.findMany({ where: { tenantId: user.tenantId, code: { in: codes } } });
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

  // 向后兼容分页:不传 page/pageSize 返回裸数组(带默认安全上限);传了则返回分页信封。
  async listEvents(user: AuthUser, batchId: string, query?: ListQuery): Promise<any[] | Paginated<any>> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const where = { tenantId: user.tenantId, batchId };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [items, total] = await this.prisma.$transaction([
        this.prisma.traceEvent.findMany({ where, orderBy: { occurredAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.traceEvent.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }
    return this.prisma.traceEvent.findMany({ where, orderBy: { occurredAt: 'asc' }, take: 500 });
  }

  /** 列出批次已生成的全部溯源码(含各自扫码次数),最新在前。
   *  未分页时默认安全上限 = MAX_CODES_PER_BATCH(与生码上限一致,不会截断合法的全量码列表)。 */
  async listCodes(user: AuthUser, batchId: string, query?: ListQuery): Promise<any[] | Paginated<any>> {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const where = { tenantId: user.tenantId, batchId };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [items, total] = await this.prisma.$transaction([
        this.prisma.traceCode.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.traceCode.count({ where }),
      ]);
      return { items, total, page, pageSize };
    }
    return this.prisma.traceCode.findMany({ where, orderBy: { createdAt: 'desc' }, take: MAX_CODES_PER_BATCH });
  }
}
