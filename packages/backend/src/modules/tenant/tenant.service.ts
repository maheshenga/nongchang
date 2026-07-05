import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  AuthUser,
  CreateTenantDto,
  CreateTenantResponse,
  Role,
  TenantListItem,
  TenantStatus,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

interface TenantRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
  _count?: { users: number; agents: number };
}

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  private toListItem(row: TenantRow): TenantListItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status as TenantStatus,
      createdAt: row.createdAt.toISOString(),
      userCount: row._count?.users ?? 0,
      agentCount: row._count?.agents ?? 0,
    };
  }

  list(): Promise<TenantListItem[]> {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        createdAt: true,
        _count: { select: { users: true, agents: true } },
      },
    }).then(rows => rows.map(row => this.toListItem(row as TenantRow)));
  }

  async create(dto: CreateTenantDto): Promise<CreateTenantResponse> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.tenant.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Tenant code already exists');

    const initialPassword = randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    return this.prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({
        data: { name: dto.name, code, status: 'active' },
      });
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username: dto.adminUsername,
          passwordHash,
          role: Role.SYSTEM_ADMIN,
          displayName: dto.adminDisplayName,
          phone: dto.adminPhone ?? null,
          status: 'active',
        },
        select: { id: true, username: true, role: true, displayName: true },
      });
      await tx.userGroup.create({
        data: { tenantId: tenant.id, name: '默认用户组', isDefault: true, permissions: [] },
      });
      return {
        ...this.toListItem({ ...tenant, _count: { users: 1, agents: 0 } }),
        adminUser: {
          id: admin.id,
          username: admin.username,
          role: Role.SYSTEM_ADMIN,
          displayName: admin.displayName,
        },
        initialPassword,
      };
    });
  }

  async setStatus(actor: AuthUser, tenantId: string, status: TenantStatus): Promise<{ id: string; status: TenantStatus }> {
    if (tenantId === actor.tenantId && status === 'suspended') {
      throw new ForbiddenException('Cannot suspend the current platform tenant');
    }
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
      select: { id: true, status: true },
    });
    return { id: updated.id, status: updated.status as TenantStatus };
  }
}
