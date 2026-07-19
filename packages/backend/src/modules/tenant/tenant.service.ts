import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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
import { SessionValidationCacheService } from '../../auth/session-validation-cache.service';
import {
  assertCanSetTenantStatus,
  buildDefaultTenantGroupCreateData,
  buildTenantAdminCreateData,
  buildTenantCreateData,
  buildTenantListFindManyArgs,
  normalizeTenantCode,
  TenantRow,
  toPaginatedTenantList,
  toTenantListItem,
  toTenantListItems,
  toTenantStatusResult,
} from './tenant.model';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    @Optional() private sessions?: SessionValidationCacheService,
  ) {}

  async list(query?: ListQuery): Promise<TenantListItem[] | Paginated<TenantListItem>> {
    if (isPaginated(query)) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.tenant.findMany(buildTenantListFindManyArgs(query)),
        this.prisma.tenant.count({}),
      ]);
      return toPaginatedTenantList(rows as TenantRow[], total, query);
    }
    const rows = await this.prisma.tenant.findMany(buildTenantListFindManyArgs(query));
    return toTenantListItems(rows as TenantRow[]);
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
        ...toTenantListItem({ ...tenant, _count: { users: 1, agents: 0 } }),
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
    await this.sessions?.invalidateTenant(tenantId);
    return toTenantStatusResult(updated);
  }
}
