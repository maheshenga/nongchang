import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthUser, CreateTraceEventDto } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class TraceService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async generateCode(user: AuthUser, batchId: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const code = `ORC-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.traceCode.create({ data: { tenantId: user.tenantId, batchId, code } });
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
}
