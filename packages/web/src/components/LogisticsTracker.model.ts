import type { CreateSupplyInput, IssueSupplyInput, SupplyItem } from '@nongchang/shared';

export interface IssueSupplyDraft {
  supplyId: string;
  amount: number;
  batchId: string;
}

export interface InboundSupplyDraft {
  name: string;
  amount: number;
  unit: string;
}

export type IssueSupplySubmission =
  | { ok: true; supplyId: string; input: IssueSupplyInput }
  | { ok: false; message: string };

export type InboundSupplySubmission =
  | { ok: true; input: CreateSupplyInput }
  | { ok: false; message: string };

export function getSupplyUsedPercent(item: Pick<SupplyItem, 'total' | 'used'>): number {
  const total = Math.max(item.total, 0);
  return total > 0 ? Math.min(100, Math.round((item.used / total) * 100)) : 0;
}

export function buildIssueSupplySubmission(payload: IssueSupplyDraft, isMerchant: boolean): IssueSupplySubmission {
  if (!isMerchant) return { ok: false, message: '当前视图只读' };
  if (!payload.supplyId || payload.amount <= 0) return { ok: false, message: '请输入完整信息' };
  if (!payload.batchId) return { ok: false, message: '请选择关联批次' };
  return { ok: true, supplyId: payload.supplyId, input: { batchId: payload.batchId, amount: payload.amount } };
}

export function buildInboundSupplySubmission(payload: InboundSupplyDraft, isMerchant: boolean): InboundSupplySubmission {
  if (!isMerchant) return { ok: false, message: '当前视图只读' };
  if (!payload.name || payload.amount <= 0) return { ok: false, message: '请输入完整信息' };
  return { ok: true, input: { name: payload.name, unit: payload.unit, amount: payload.amount } };
}
