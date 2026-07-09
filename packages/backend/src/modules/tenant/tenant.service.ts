import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  AuthUser,
  CreateTenantDto,
  CreateTenantResponse,
  ListQuery,
  Paginated,
  Role,
  TenantListItem,
  TenantStatus,
  isPaginated,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_USER_GROUP_PERMISSIONS } from '../user-group/default-permissions';
import {
  assertCanSetTenantStatus,
  buildDefaultTenantGroupCreateData,
  buildTenantAdminCreateData,
  buildTenantCreateData,
  normalizeTenantCode,
  TenantRow,
  toTenantListItem,
  toTenantStatusResult,
} from './tenant.model';

const DEFAULT_LIST_CAP = 500;

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  private toListItem(row: TenantRow): TenantListItem {
    return toTenantListItem(row);
  }

  async list(query?: ListQuery): Promise<TenantListItem[] | Paginated<TenantListItem>> {
    const select = {
      id: true,
      name: true,
      code: true,
      status: true,
      createdAt: true,
      _count: { select: { users: true, agents: true } },
    };
    if (isPaginated(query)) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.tenant.findMany({
          orderBy: { createdAt: 'desc' },
          select,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.tenant.count({}),
      ]);
      return { items: rows.map(row => this.toListItem(row as TenantRow)), total, page, pageSize };
    }
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select,
      take: DEFAULT_LIST_CAP,
    }).then(rows => rows.map(row => this.toListItem(row as TenantRow)));
  }

  async create(dto: CreateTenantDto): Promise<CreateTenantResponse> {
    const code = normalizeTenantCode(dto.code);
    const existing = await this.prisma.tenant.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Tenant code already exists');

    const initialPassword = randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    return this.prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({
        data: buildTenantCreateData(dto, code),
      });
      const admin = await tx.user.create({
        data: buildTenantAdminCreateData(tenant.id, passwordHash, dto),
        select: { id: true, username: true, role: true, displayName: true },
      });
      await tx.userGroup.create({
        data: buildDefaultTenantGroupCreateData(tenant.id, DEFAULT_USER_GROUP_PERMISSIONS),
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
    assertCanSetTenantStatus(actor, tenantId, status);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
      select: { id: true, status: true },
    });
    return toTenantStatusResult(updated);
  }
}
