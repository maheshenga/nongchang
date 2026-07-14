import type { AccountDataExport, MeProfileView } from '@nongchang/shared';

export const EXPORT_ROW_LIMIT = 10_000;
export const EXPORT_BYTE_LIMIT = 10 * 1024 * 1024;
export const PREVIEW_LIMIT = 20;
export const EXPORT_EXCLUSIONS = [
  '不包含密码、令牌、会话版本、微信 OpenID 和第三方密钥。',
  '不包含其他用户的个人资料、记录或上传内容。',
  '不包含 OSS 对象键、支付密钥、交易密钥和内部幂等标识。',
  '不包含上传文件二进制，仅包含允许公开给本人的上传元数据。',
];

export type AccountDataExportFormat = 'json' | 'csv';

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : String(value);
  const text = /^[\t ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvDetail(entries: Array<[string, unknown]>): string {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => {
      const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `${label}：${rendered}`;
    })
    .join('；');
}

export function buildAccountDataCsv(payload: AccountDataExport): string {
  const rows: Array<[string, string, string, string, string]> = [
    [
      '机构',
      payload.tenant.name,
      payload.tenant.code,
      payload.generatedAt,
      '',
    ],
    [
      '账户',
      payload.account.displayName,
      payload.account.status,
      payload.generatedAt,
      csvDetail([
        ['用户名', payload.account.username],
        ['角色', payload.account.role],
        ['联系电话', payload.account.phone],
      ]),
    ],
  ];

  for (const row of payload.data.fields) {
    rows.push(['地块', row.name, '', row.createdAt, csvDetail([['面积', row.area]])]);
  }
  for (const row of payload.data.batches) {
    rows.push([
      '批次',
      `${row.batchNo} ${row.cropName}`.trim(),
      row.status,
      row.createdAt,
      csvDetail([['种植日期', row.plantDate], ['预计采收', row.expectedHarvest]]),
    ]);
  }
  for (const row of payload.data.farmRecords) {
    rows.push([
      '农事记录',
      row.action,
      row.status,
      row.recordedAt,
      csvDetail([['地点', row.location], ['来源', row.source], ['详情', row.detail]]),
    ]);
  }
  for (const row of payload.data.supplies) {
    rows.push([
      '农资库存', row.name, '', row.createdAt,
      csvDetail([['单位', row.unit], ['总量', row.total], ['已用', row.used]]),
    ]);
  }
  for (const row of payload.data.supplyIssues) {
    rows.push([
      '农资领用', '农资领用记录', '', row.createdAt,
      csvDetail([['数量', row.amount], ['单价', row.unitPrice]]),
    ]);
  }
  for (const row of payload.data.uploads) {
    rows.push([
      '上传记录', row.purpose || '上传记录', row.status, row.createdAt,
      csvDetail([['文件大小', row.sizeBytes], ['访问地址', row.url]]),
    ]);
  }
  for (const row of payload.data.aiOperations) {
    rows.push([
      'AI 操作', row.kind || 'AI 操作', row.status, row.createdAt,
      csvDetail([['错误分类', row.errorCategory], ['更新时间', row.updatedAt]]),
    ]);
  }
  for (const row of payload.data.creditOrders) {
    rows.push([
      '额度订单', row.resource || '额度订单', row.status, row.paidAt ?? row.createdAt,
      csvDetail([
        ['数量', row.quantity],
        ['金额（分）', row.amountCents],
        ['支付渠道', row.payChannel],
      ]),
    ]);
  }
  for (const row of payload.data.creditAccount?.ledgers ?? []) {
    rows.push([
      '额度流水', row.resource || '额度流水', row.reason, row.createdAt,
      csvDetail([['变动', row.delta], ['变动后余额', row.balanceAfter], ['备注', row.note]]),
    ]);
  }

  const header = ['类别', '名称', '状态', '发生时间', '详情'];
  return `\ufeff${[header, ...rows]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\r\n')}`;
}

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
