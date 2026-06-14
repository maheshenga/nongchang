import { Injectable, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CreateUserDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    let agentId = dto.agentId ?? null;
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
      agentId = actor.agentId;
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId: actor.tenantId, role: dto.role, agentId,
        username: dto.username, passwordHash, phone: dto.phone ?? null,
        displayName: dto.displayName,
      },
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
  }

  list(actor: AuthUser) {
    const where: Record<string, string> = { tenantId: actor.tenantId };
    if (actor.role === Role.AGENT_ADMIN) {
      if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = actor.agentId;
    }
    return this.prisma.user.findMany({
      where, select: { id: true, username: true, role: true, agentId: true, displayName: true, status: true },
    });
  }
}
