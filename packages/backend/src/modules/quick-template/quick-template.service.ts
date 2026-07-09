import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, QuickTemplateInput, QuickTemplateView } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildQuickTemplateCreateData,
  buildQuickTemplateTenantWhere,
  buildQuickTemplateUpdateData,
  buildQuickTemplateView,
  type QuickTemplateRow,
} from './quick-template.model';

@Injectable()
export class QuickTemplateService {
  constructor(private prisma: PrismaService) {}

  async list(user: AuthUser): Promise<QuickTemplateView[]> {
    const rows = (await this.prisma.quickTemplate.findMany({
      where: buildQuickTemplateTenantWhere({ tenantId: user.tenantId }),
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    })) as QuickTemplateRow[];
    return rows.map(buildQuickTemplateView);
  }

  async create(user: AuthUser, dto: QuickTemplateInput): Promise<QuickTemplateView> {
    const row = (await this.prisma.quickTemplate.create({
      data: buildQuickTemplateCreateData({ tenantId: user.tenantId, dto }),
    })) as QuickTemplateRow;
    return buildQuickTemplateView(row);
  }

  async update(user: AuthUser, id: string, dto: QuickTemplateInput): Promise<QuickTemplateView> {
    const existing = (await this.prisma.quickTemplate.findFirst({
      where: buildQuickTemplateTenantWhere({ tenantId: user.tenantId, id }),
    })) as QuickTemplateRow | null;
    if (!existing) throw new NotFoundException('快捷模板不存在');

    const row = (await this.prisma.quickTemplate.update({
      where: { id },
      data: buildQuickTemplateUpdateData(dto),
    })) as QuickTemplateRow;
    return buildQuickTemplateView(row);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = (await this.prisma.quickTemplate.findFirst({
      where: buildQuickTemplateTenantWhere({ tenantId: user.tenantId, id }),
    })) as QuickTemplateRow | null;
    if (!existing) throw new NotFoundException('快捷模板不存在');
    await this.prisma.quickTemplate.delete({ where: { id } });
  }
}
