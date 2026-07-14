import type { MeProfileView } from '@nongchang/shared';

export const EXPORT_ROW_LIMIT = 10_000;
export const EXPORT_BYTE_LIMIT = 10 * 1024 * 1024;
export const PREVIEW_LIMIT = 20;
export const EXPORT_EXCLUSIONS = [
  '不包含密码、令牌、会话版本、微信 OpenID 和第三方密钥。',
  '不包含其他用户的个人资料、记录或上传内容。',
  '不包含 OSS 对象键、支付密钥、交易密钥和内部幂等标识。',
  '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
];

type NumericValue = number | string | { toString(): string };

interface AccountProfileRow {
  id: string;
  tenantId: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
  phone: string | null;
  status: string;
  wxOpenid: string | null;
}

export function toAccountProfile(row: AccountProfileRow): MeProfileView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    username: row.username,
    role: row.role as MeProfileView['role'],
    agentId: row.agentId,
    displayName: row.displayName,
    phone: row.phone,
    status: row.status,
    deletionVerification: row.wxOpenid ? 'wechat' : 'password',
  };
}

export function toAccountField(row: {
  id: string; name: string; area: number; createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountBatch(row: {
  id: string; batchNo: string; cropName: string; status: string;
  plantDate: Date; expectedHarvest: Date; createdAt: Date;
}) {
  return {
    id: row.id,
    batchNo: row.batchNo,
    cropName: row.cropName,
    status: row.status,
    plantDate: row.plantDate.toISOString(),
    expectedHarvest: row.expectedHarvest.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountFarmRecord(row: {
  id: string; batchId: string; fieldId: string; action: string; detail: unknown;
  images: unknown; location: string | null; recordedAt: Date; source: string;
  status: string; createdAt: Date;
}) {
  return {
    id: row.id,
    batchId: row.batchId,
    fieldId: row.fieldId,
    action: row.action,
    detail: row.detail ?? null,
    images: Array.isArray(row.images)
      ? row.images.filter((value): value is string => typeof value === 'string')
      : [],
    location: row.location,
    recordedAt: row.recordedAt.toISOString(),
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountSupply(row: {
  id: string; name: string; unit: string; total: NumericValue; used: NumericValue; createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    total: Number(row.total),
    used: Number(row.used),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountSupplyIssue(row: {
  id: string; supplyId: string; batchId: string; amount: NumericValue;
  unitPrice: NumericValue; createdAt: Date;
}) {
  return {
    id: row.id,
    supplyId: row.supplyId,
    batchId: row.batchId,
    amount: Number(row.amount),
    unitPrice: Number(row.unitPrice),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountUpload(row: {
  id: string; purpose: string; url: string | null; sizeBytes: bigint | NumericValue;
  status: string; createdAt: Date;
}) {
  return {
    id: row.id,
    purpose: row.purpose,
    url: row.url,
    sizeBytes: row.sizeBytes.toString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountAiOperation(row: {
  id: string; kind: string; status: string; errorCategory: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    errorCategory: row.errorCategory,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAccountCreditOrder(row: {
  id: string; resource: string; quantity: number; amountCents: number;
  status: string; payChannel: string | null; paidAt: Date | null; createdAt: Date;
}) {
  return {
    id: row.id,
    resource: row.resource,
    quantity: row.quantity,
    amountCents: row.amountCents,
    status: row.status,
    payChannel: row.payChannel,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAccountCreditLedger(row: {
  id: string; resource: string; delta: number; balanceAfter: number; reason: string;
  note: string | null; createdAt: Date;
}) {
  return {
    id: row.id,
    resource: row.resource,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccountCreditAccount(
  row: { aiBalance: number; codeBalance: number },
  ledgers: Array<Parameters<typeof toAccountCreditLedger>[0]>,
) {
  return {
    aiBalance: row.aiBalance,
    codeBalance: row.codeBalance,
    ledgers: ledgers.map(toAccountCreditLedger),
  };
}
