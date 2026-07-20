import type { CreateFieldDto } from '@nongchang/shared';

export const DEFAULT_FIELD_LIST_CAP = 500;

export interface FieldRow {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  area: number;
  iotDeviceId: string | null;
  createdAt: Date;
}

export interface FieldOwnerRow {
  id: string;
  displayName: string;
}

export interface FieldCoordinateRow {
  id: string;
  lng: number | null;
  lat: number | null;
}

export interface FieldCreateData {
  tenantId: string;
  ownerId: string;
  name: string;
  area: number;
  iotDeviceId: string | null;
}

export interface FieldListFindManyArgs {
  where: Record<string, unknown>;
  orderBy: { createdAt: 'desc' };
  skip?: number;
  take: number;
}

export function buildFieldCreateData(input: { tenantId: string; ownerId: string; dto: CreateFieldDto }): FieldCreateData {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    name: input.dto.name,
    area: input.dto.area,
    iotDeviceId: input.dto.iotDeviceId ?? null,
  };
}

export function buildFieldPagination(input?: { page?: number; pageSize?: number }) {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildFieldListFindManyArgs(input: { where: Record<string, unknown>; page?: number; pageSize?: number }): FieldListFindManyArgs {
  if (input.page !== undefined || input.pageSize !== undefined) {
    const { skip, take } = buildFieldPagination(input);
    return { where: input.where, orderBy: { createdAt: 'desc' }, skip, take };
  }
  return { where: input.where, orderBy: { createdAt: 'desc' }, take: DEFAULT_FIELD_LIST_CAP };
}

export function buildFieldOwnerIds(fields: FieldRow[]): string[] {
  return [...new Set(fields.map((field) => field.ownerId))];
}

export function buildFieldIds(fields: FieldRow[]): string[] {
  return fields.map((field) => field.id);
}

export function buildFieldView(
  field: FieldRow,
  owner: FieldOwnerRow | null,
  coordinate: FieldCoordinateRow | null,
) {
  return {
    ...field,
    ownerName: owner?.displayName ?? null,
    lng: coordinate?.lng ?? null,
    lat: coordinate?.lat ?? null,
  };
}

export function enrichFieldRows(input: { fields: FieldRow[]; owners: FieldOwnerRow[]; coords: FieldCoordinateRow[] }) {
  const ownerNameById = new Map(input.owners.map((owner) => [owner.id, owner.displayName]));
  const coordByFieldId = new Map(input.coords.map((coord) => [coord.id, coord]));
  return input.fields.map((field) => buildFieldView(
    field,
    ownerNameById.has(field.ownerId)
      ? { id: field.ownerId, displayName: ownerNameById.get(field.ownerId)! }
      : null,
    coordByFieldId.get(field.id) ?? null,
  ));
}
