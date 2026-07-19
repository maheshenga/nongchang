import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Role,
  type AuthUser,
  type TenantSettingsView,
  type UpdateTenantSettingsInput,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicTraceCacheService } from '../public-trace/public-trace-cache.service';
import {
  buildTenantSettingsUpsertArgs,
  toTenantSettingsView,
  type TenantSettingsRow,
} from './tenant-settings.model';

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PublicTraceCacheService,
  ) {}

  async getByTenantId(tenantId: string): Promise<TenantSettingsView> {
    const [row, tenant] = await Promise.all([
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    if (!tenant) throw new NotFoundException('租户不存在');
    return toTenantSettingsView(row as TenantSettingsRow | null, tenant.name);
  }

  async update(
    user: AuthUser,
    dto: UpdateTenantSettingsInput,
  ): Promise<TenantSettingsView> {
    if (user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('无权修改租户设置');
    }
    const row = await this.prisma.tenantSettings.upsert(
      buildTenantSettingsUpsertArgs(user.tenantId, dto),
    );
    await this.cache.invalidateTenant(user.tenantId);
    return toTenantSettingsView(row as TenantSettingsRow, '');
  }
}
