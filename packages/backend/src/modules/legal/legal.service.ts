import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  legalDocumentPayloadSchema,
  type AuthUser,
  type LegalDocumentPayload,
  type LegalPublicationSummary,
  type LegalSettingsView,
  type PublicLegalQuery,
  type PublicLegalResponse,
} from '@nongchang/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationConfigService } from '../integration/integration-config.service';
import {
  toDateOnly,
  toPublicationSummary,
  toPublicLegal,
  type LegalPublicationRow,
} from './legal.model';

interface LegalDraftRow extends Omit<LegalDocumentPayload, 'effectiveDate'> {
  effectiveDate: Date;
}

type LegalDb = PrismaService | Prisma.TransactionClient;

function toLegalDraft(row: LegalDraftRow): LegalDocumentPayload {
  return {
    operatorName: row.operatorName,
    contactAddress: row.contactAddress,
    privacyContact: row.privacyContact,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    privacyVersion: row.privacyVersion,
    agreementVersion: row.agreementVersion,
    effectiveDate: toDateOnly(row.effectiveDate),
    privacyPolicyText: row.privacyPolicyText,
    userAgreementText: row.userAgreementText,
  };
}

function toLegalSettingsView(
  settings: LegalDraftRow & { currentPublication: LegalPublicationRow | null },
): LegalSettingsView {
  return {
    draft: toLegalDraft(settings),
    currentPublication: settings.currentPublication
      ? toPublicationSummary(settings.currentPublication)
      : null,
  };
}

@Injectable()
export class LegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationConfigService,
  ) {}

  async getSettings(actor: AuthUser): Promise<LegalSettingsView> {
    const settings = await this.prisma.legalSettings.findUnique({
      where: { tenantId: actor.tenantId },
      include: { currentPublication: true },
    });
    if (!settings) return { draft: null, currentPublication: null };
    return toLegalSettingsView(settings as LegalDraftRow & {
      currentPublication: LegalPublicationRow | null;
    });
  }

  async saveDraft(actor: AuthUser, input: LegalDocumentPayload): Promise<LegalSettingsView> {
    const draft = legalDocumentPayloadSchema.parse(input);
    const storedDraft = {
      ...draft,
      effectiveDate: new Date(`${draft.effectiveDate}T00:00:00.000Z`),
    };
    const settings = await this.prisma.legalSettings.upsert({
      where: { tenantId: actor.tenantId },
      create: { tenantId: actor.tenantId, ...storedDraft },
      update: storedDraft,
      include: { currentPublication: true },
    });
    return toLegalSettingsView(settings as LegalDraftRow & {
      currentPublication: LegalPublicationRow | null;
    });
  }

  async publish(actor: AuthUser): Promise<LegalPublicationSummary> {
    try {
      return await this.prisma.$transaction(async tx => {
        const settings = await tx.legalSettings.findUnique({
          where: { tenantId: actor.tenantId },
        });
        if (!settings) {
          throw new ConflictException('请先保存完整的协议草稿');
        }
        const parsed = legalDocumentPayloadSchema.safeParse(toLegalDraft(settings));
        if (!parsed.success) {
          throw new BadRequestException(
            parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
          );
        }
        const draft = parsed.data;
        const publication = await tx.legalPublication.create({
          data: {
            tenantId: actor.tenantId,
            ...draft,
            effectiveDate: settings.effectiveDate,
          },
        });
        await tx.legalSettings.update({
          where: { tenantId: actor.tenantId },
          data: { currentPublicationId: publication.id },
        });
        return toPublicationSummary(publication as LegalPublicationRow);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('协议版本号已发布，请更新版本号后重试');
      }
      throw error;
    }
  }

  async getPublic(query: PublicLegalQuery): Promise<PublicLegalResponse> {
    const [tenant, appTenantId] = await Promise.all([
      query.tenantCode
      ? this.prisma.tenant.findUnique({
          where: { code: query.tenantCode },
          select: { id: true },
        })
      : null,
      query.appId ? this.integrations.findEnabledWechatTenantId(query.appId) : null,
    ]);
    const tenantId = tenant?.id ?? appTenantId;
    if (
      !tenantId
      || (query.tenantCode && !tenant)
      || (query.appId && !appTenantId)
      || (tenant && appTenantId && tenant.id !== appTenantId)
    ) {
      throw new NotFoundException('未找到匹配的机构协议');
    }
    const settings = await this.prisma.legalSettings.findUnique({
      where: { tenantId },
      select: { currentPublication: true },
    });
    return settings?.currentPublication
      ? toPublicLegal(settings.currentPublication as LegalPublicationRow)
      : { configured: false, tenantId };
  }

  async getPrivacyContact(tenantId: string): Promise<string> {
    const settings = await this.prisma.legalSettings.findUnique({
      where: { tenantId },
      select: {
        currentPublication: {
          select: {
            privacyContact: true,
            contactPhone: true,
            contactEmail: true,
          },
        },
      },
    });
    const publication = settings?.currentPublication;
    if (!publication) return '请联系机构管理员';
    const contact = [
      publication.privacyContact,
      publication.contactPhone,
      publication.contactEmail,
    ].filter((value): value is string => Boolean(value?.trim()));
    return contact.length > 0 ? contact.join('，') : '请联系机构管理员';
  }

  async requireCurrentPublication(
    tenantId: string,
    publicationId: string,
    db: LegalDb = this.prisma,
  ): Promise<LegalPublicationRow> {
    const settings = await db.legalSettings.findUnique({
      where: { tenantId },
      select: { currentPublicationId: true },
    });
    if (!settings?.currentPublicationId) {
      throw new ConflictException('当前机构尚未发布协议');
    }
    if (settings.currentPublicationId !== publicationId) {
      throw new ConflictException('协议版本已更新，请重新阅读并同意');
    }
    const publication = await db.legalPublication.findFirst({
      where: { id: publicationId, tenantId },
    });
    if (!publication) {
      throw new ConflictException('协议版本与当前机构不匹配');
    }
    return publication as LegalPublicationRow;
  }

  async createConsent(
    db: LegalDb,
    input: { tenantId: string; userId: string; publication: LegalPublicationRow },
  ): Promise<void> {
    await db.legalConsent.upsert({
      where: {
        userId_publicationId_client: {
          userId: input.userId,
          publicationId: input.publication.id,
          client: 'miniapp',
        },
      },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        publicationId: input.publication.id,
        privacyVersion: input.publication.privacyVersion,
        agreementVersion: input.publication.agreementVersion,
        client: 'miniapp',
      },
      update: {},
    });
  }

  async recordConsent(input: {
    tenantId: string;
    userId: string;
    publicationId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const publication = await this.requireCurrentPublication(
        input.tenantId,
        input.publicationId,
        tx,
      );
      await this.createConsent(tx, { ...input, publication });
    });
  }
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'P2002';
}
