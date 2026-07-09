import type { QuickTemplateInput, QuickTemplateView } from '@nongchang/shared';

export interface QuickTemplateRow {
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

export interface QuickTemplateCreateData {
  tenantId: string;
  name: string;
  action: string;
  note: string | null;
  cost: number | null;
  labor: number | null;
  sort: number;
}

export type QuickTemplateUpdateData = Partial<Omit<QuickTemplateCreateData, 'tenantId'>>;

export function buildQuickTemplateView(row: QuickTemplateRow): QuickTemplateView {
  return {
    id: row.id,
    name: row.name,
    action: row.action,
    note: row.note,
    cost: row.cost,
    labor: row.labor,
    sort: row.sort,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export function buildQuickTemplateCreateData(input: { tenantId: string; dto: QuickTemplateInput }): QuickTemplateCreateData {
  return {
    tenantId: input.tenantId,
    name: input.dto.name,
    action: input.dto.action,
    note: input.dto.note ?? null,
    cost: input.dto.cost ?? null,
    labor: input.dto.labor ?? null,
    sort: input.dto.sort ?? 0,
  };
}

export function buildQuickTemplateUpdateData(dto: QuickTemplateInput): QuickTemplateUpdateData {
  const data: QuickTemplateUpdateData = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.action !== undefined) data.action = dto.action;
  if (dto.note !== undefined) data.note = dto.note;
  if (dto.cost !== undefined) data.cost = dto.cost;
  if (dto.labor !== undefined) data.labor = dto.labor;
  if (dto.sort !== undefined) data.sort = dto.sort;
  return data;
}

export function buildQuickTemplateTenantWhere(input: { tenantId: string; id?: string }): Record<string, string> {
  return input.id !== undefined ? { tenantId: input.tenantId, id: input.id } : { tenantId: input.tenantId };
}
