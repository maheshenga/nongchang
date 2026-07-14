import { Injectable, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import {
  accountDataExportSchema,
  accountDataPreviewSchema,
  type AccountDataPreview,
  type AuthUser,
} from '@nongchang/shared';
import { CreditOwnerType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LegalService } from '../legal/legal.service';
import {
  EXPORT_BYTE_LIMIT,
  EXPORT_EXCLUSIONS,
  EXPORT_ROW_LIMIT,
  PREVIEW_LIMIT,
  buildAccountDataCsv,
  toAccountAiOperation,
  toAccountBatch,
  toAccountCreditAccount,
  toAccountCreditOrder,
  toAccountFarmRecord,
  toAccountField,
  toAccountProfile,
  toAccountSupply,
  toAccountSupplyIssue,
  toAccountUpload,
  type AccountDataExportFormat,
} from './account-data.model';

const accountSelect = {
  id: true,
  tenantId: true,
  username: true,
  role: true,
  agentId: true,
  displayName: true,
  phone: true,
  status: true,
  wxOpenid: true,
} as const;

const categoryLabels = {
  fields: '地块',
  batches: '批次',
  farmRecords: '农事记录',
  supplies: '农资库存',
  supplyIssues: '农资领用',
  uploads: '上传记录',
  aiOperations: 'AI 操作',
  creditOrders: '额度订单',
  creditLedgers: '额度流水',
} as const;

type CountKey = keyof typeof categoryLabels;
type AccountCounts = Record<CountKey, number>;

interface CreditAccountRow {
  id: string;
  aiBalance: number;
  codeBalance: number;
}

@Injectable()
export class AccountDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalService,
  ) {}

  async preview(actor: AuthUser): Promise<AccountDataPreview> {
    const [identity, creditAccount] = await Promise.all([
      this.loadIdentity(actor),
      this.loadCreditAccount(actor),
    ]);
    const [counts, recent] = await Promise.all([
      this.loadCounts(actor, creditAccount?.id ?? null),
      this.loadCollections(actor, creditAccount, PREVIEW_LIMIT),
    ]);
    return accountDataPreviewSchema.parse({
      generatedAt: new Date().toISOString(),
      ...identity,
      counts,
      recent,
      recentLimit: PREVIEW_LIMIT,
    });
  }

  async export(
    actor: AuthUser,
    format: AccountDataExportFormat = 'json',
  ): Promise<{ fileName: string; body: Buffer }> {
    const [identity, creditAccount] = await Promise.all([
      this.loadIdentity(actor),
      this.loadCreditAccount(actor),
    ]);
    const counts = await this.loadCounts(actor, creditAccount?.id ?? null);
    const overLimit = (Object.entries(counts) as Array<[CountKey, number]>)
      .find(([, count]) => count > EXPORT_ROW_LIMIT);
    if (overLimit) {
      await this.rejectExport(actor.tenantId, categoryLabels[overLimit[0]]);
    }

    const data = await this.loadCollections(actor, creditAccount);
    const payload = accountDataExportSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      ...identity,
      data,
      exclusions: EXPORT_EXCLUSIONS,
    });
    const serialized = format === 'csv'
      ? buildAccountDataCsv(payload)
      : JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > EXPORT_BYTE_LIMIT) {
      await this.rejectExport(actor.tenantId, '导出文件');
    }
    return {
      fileName: `nongchang-account-data-${new Date().toISOString().slice(0, 10)}.${format}`,
      body: Buffer.from(serialized, 'utf8'),
    };
  }

  private scopes(actor: AuthUser) {
    return {
      field: { tenantId: actor.tenantId, ownerId: actor.userId },
      batch: { tenantId: actor.tenantId, ownerId: actor.userId },
      farmRecord: { tenantId: actor.tenantId, operatorId: actor.userId },
      supply: { tenantId: actor.tenantId, ownerId: actor.userId },
      supplyIssue: { tenantId: actor.tenantId, ownerId: actor.userId },
      uploadAsset: { tenantId: actor.tenantId, userId: actor.userId },
      aiOperation: { tenantId: actor.tenantId, userId: actor.userId },
      creditOrder: { tenantId: actor.tenantId, buyerId: actor.userId },
      creditAccount: {
        tenantId_ownerType_ownerId: {
          tenantId: actor.tenantId,
          ownerType: CreditOwnerType.MERCHANT,
          ownerId: actor.userId,
        },
      },
    };
  }

  private async loadIdentity(actor: AuthUser) {
    const [tenant, user] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: actor.tenantId },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: actor.userId, tenantId: actor.tenantId },
        select: accountSelect,
      }),
    ]);
    if (!tenant || !user) throw new UnauthorizedException('账号不存在');
    return { tenant, account: toAccountProfile(user) };
  }

  private loadCreditAccount(actor: AuthUser): Promise<CreditAccountRow | null> {
    return this.prisma.creditAccount.findUnique({
      where: this.scopes(actor).creditAccount,
      select: { id: true, aiBalance: true, codeBalance: true },
    });
  }

  private async loadCounts(actor: AuthUser, creditAccountId: string | null): Promise<AccountCounts> {
    const scope = this.scopes(actor);
    const [
      fields,
      batches,
      farmRecords,
      supplies,
      supplyIssues,
      uploads,
      aiOperations,
      creditOrders,
      creditLedgers,
    ] = await Promise.all([
      this.prisma.field.count({ where: scope.field }),
      this.prisma.batch.count({ where: scope.batch }),
      this.prisma.farmRecord.count({ where: scope.farmRecord }),
      this.prisma.supply.count({ where: scope.supply }),
      this.prisma.supplyIssue.count({ where: scope.supplyIssue }),
      this.prisma.uploadAsset.count({ where: scope.uploadAsset }),
      this.prisma.aiOperation.count({ where: scope.aiOperation }),
      this.prisma.creditOrder.count({ where: scope.creditOrder }),
      creditAccountId
        ? this.prisma.creditLedger.count({ where: { accountId: creditAccountId } })
        : Promise.resolve(0),
    ]);
    return {
      fields,
      batches,
      farmRecords,
      supplies,
      supplyIssues,
      uploads,
      aiOperations,
      creditOrders,
      creditLedgers,
    };
  }

  private async loadCollections(
    actor: AuthUser,
    creditAccount: CreditAccountRow | null,
    take?: number,
  ) {
    const scope = this.scopes(actor);
    const latest = { orderBy: { createdAt: 'desc' as const }, ...(take ? { take } : {}) };
    const [
      fields,
      batches,
      farmRecords,
      supplies,
      supplyIssues,
      uploads,
      aiOperations,
      creditOrders,
      creditLedgers,
    ] = await Promise.all([
      this.prisma.field.findMany({
        where: scope.field,
        select: { id: true, name: true, area: true, createdAt: true },
        ...latest,
      }),
      this.prisma.batch.findMany({
        where: scope.batch,
        select: {
          id: true, batchNo: true, cropName: true, status: true,
          plantDate: true, expectedHarvest: true, createdAt: true,
        },
        ...latest,
      }),
      this.prisma.farmRecord.findMany({
        where: scope.farmRecord,
        select: {
          id: true, batchId: true, fieldId: true, action: true, detail: true,
          images: true, location: true, recordedAt: true, source: true, status: true,
          createdAt: true,
        },
        ...latest,
      }),
      this.prisma.supply.findMany({
        where: scope.supply,
        select: { id: true, name: true, unit: true, total: true, used: true, createdAt: true },
        ...latest,
      }),
      this.prisma.supplyIssue.findMany({
        where: scope.supplyIssue,
        select: {
          id: true, supplyId: true, batchId: true, amount: true, unitPrice: true, createdAt: true,
        },
        ...latest,
      }),
      this.prisma.uploadAsset.findMany({
        where: scope.uploadAsset,
        select: { id: true, purpose: true, url: true, sizeBytes: true, status: true, createdAt: true },
        ...latest,
      }),
      this.prisma.aiOperation.findMany({
        where: scope.aiOperation,
        select: {
          id: true, kind: true, status: true, errorCategory: true,
          createdAt: true, updatedAt: true,
        },
        ...latest,
      }),
      this.prisma.creditOrder.findMany({
        where: scope.creditOrder,
        select: {
          id: true, resource: true, quantity: true, amountCents: true, status: true,
          payChannel: true, paidAt: true, createdAt: true,
        },
        ...latest,
      }),
      creditAccount
        ? this.prisma.creditLedger.findMany({
            where: { accountId: creditAccount.id },
            select: {
              id: true, resource: true, delta: true, balanceAfter: true, reason: true,
              note: true, createdAt: true,
            },
            ...latest,
          })
        : Promise.resolve([]),
    ]);
    return {
      fields: fields.map(toAccountField),
      batches: batches.map(toAccountBatch),
      farmRecords: farmRecords.map(toAccountFarmRecord),
      supplies: supplies.map(toAccountSupply),
      supplyIssues: supplyIssues.map(toAccountSupplyIssue),
      uploads: uploads.map(toAccountUpload),
      aiOperations: aiOperations.map(toAccountAiOperation),
      creditOrders: creditOrders.map(toAccountCreditOrder),
      creditAccount: creditAccount
        ? toAccountCreditAccount(creditAccount, creditLedgers)
        : null,
    };
  }

  private async rejectExport(tenantId: string, category: string): Promise<never> {
    const privacyContact = await this.legal.getPrivacyContact(tenantId);
    const contactInstruction = privacyContact.startsWith('请联系')
      ? privacyContact
      : `请联系${privacyContact}`;
    throw new PayloadTooLargeException(
      `${category}数据超过单次导出限制，${contactInstruction}协助处理。`,
    );
  }
}
