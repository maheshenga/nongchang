import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, QuickTemplateInput, QuickTemplateView } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

interface QuickTemplateRow {
  id: string;
  tenantId: string;
  name: string;
  action: string;
  note: string | null;
  cost: number | null;
  labor: number | null;
  sort: number;
  createdAt: Date;
}

@Injectable()
export class QuickTemplateService {
  constructor(private prisma: PrismaService) {}

  private toView(r: QuickTemplateRow): QuickTemplateView {
    return {
      id: r.id,
      name: r.name,
      action: r.action,
      note: r.note,
      cost: r.cost,
      labor: r.labor,
      sort: r.sort,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    };
  }

  async list(user: AuthUser): Promise<QuickTemplateView[]> {
    const rows = (await this.prisma.quickTemplate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    })) as QuickTemplateRow[];
    return rows.map(r => this.toView(r));
  }

  async create(user: AuthUser, dto: QuickTemplateInput): Promise<QuickTemplateView> {
    const row = (await this.prisma.quickTemplate.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        action: dto.action,
        note: dto.note ?? null,
        cost: dto.cost ?? null,
        labor: dto.labor ?? null,
        sort: dto.sort ?? 0,
      },
    })) as QuickTemplateRow;
    return this.toView(row);
  }

  async update(user: AuthUser, id: string, dto: QuickTemplateInput): Promise<QuickTemplateView> {
    const existing = (await this.prisma.quickTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    })) as QuickTemplateRow | null;
    if (!existing) throw new NotFoundException('快捷模板不存在');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.action !== undefined) data.action = dto.action;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.cost !== undefined) data.cost = dto.cost;
    if (dto.labor !== undefined) data.labor = dto.labor;
    if (dto.sort !== undefined) data.sort = dto.sort;

    const row = (await this.prisma.quickTemplate.update({
      where: { id },
      data,
    })) as QuickTemplateRow;
    return this.toView(row);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = (await this.prisma.quickTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    })) as QuickTemplateRow | null;
    if (!existing) throw new NotFoundException('快捷模板不存在');
    await this.prisma.quickTemplate.delete({ where: { id } });
  }
}
