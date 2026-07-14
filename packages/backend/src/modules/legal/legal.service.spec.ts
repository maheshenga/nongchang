import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';

const systemAdmin = {
  userId: 'admin-1',
  tenantId: '11111111-1111-4111-8111-111111111111',
  role: 'system_admin',
  agentId: null,
  ownerId: null,
} as AuthUser;

const draftRow = {
  id: '33333333-3333-4333-8333-333333333333',
  tenantId: systemAdmin.tenantId,
  operatorName: '示例农业科技有限公司',
  contactAddress: '杭州市示例路 1 号',
  privacyContact: '数据保护负责人',
  contactPhone: '0571-12345678',
  contactEmail: null,
  privacyVersion: 'privacy-v1',
  agreementVersion: 'agreement-v1',
  effectiveDate: new Date('2026-07-14T00:00:00.000Z'),
  privacyPolicyText: '隐私政策正文'.repeat(80),
  userAgreementText: '用户协议正文'.repeat(80),
  currentPublicationId: '22222222-2222-4222-8222-222222222222',
  createdAt: new Date('2026-07-14T08:00:00.000Z'),
  updatedAt: new Date('2026-07-14T10:00:00.000Z'),
};

const publicationRow = {
  id: draftRow.currentPublicationId,
  tenantId: systemAdmin.tenantId,
  operatorName: draftRow.operatorName,
  contactAddress: draftRow.contactAddress,
  privacyContact: draftRow.privacyContact,
  contactPhone: draftRow.contactPhone,
  contactEmail: draftRow.contactEmail,
  privacyVersion: draftRow.privacyVersion,
  agreementVersion: draftRow.agreementVersion,
  effectiveDate: draftRow.effectiveDate,
  privacyPolicyText: draftRow.privacyPolicyText,
  userAgreementText: draftRow.userAgreementText,
  publishedAt: new Date('2026-07-14T09:00:00.000Z'),
};

const draftInput = {
  operatorName: draftRow.operatorName,
  contactAddress: draftRow.contactAddress,
  privacyContact: draftRow.privacyContact,
  contactPhone: draftRow.contactPhone,
  contactEmail: draftRow.contactEmail,
  privacyVersion: draftRow.privacyVersion,
  agreementVersion: draftRow.agreementVersion,
  effectiveDate: '2026-07-14',
  privacyPolicyText: draftRow.privacyPolicyText,
  userAgreementText: draftRow.userAgreementText,
};

describe('LegalService', () => {
  it('returns an empty draft and publication view before configuration', async () => {
    const { LegalService } = await import('./legal.service');
    const prisma = {
      legalSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = new LegalService(prisma as never, {} as never);

    await expect(service.getSettings(systemAdmin)).resolves.toEqual({
      draft: null,
      currentPublication: null,
    });
  });

  it('maps the tenant draft and immutable current publication separately', async () => {
    const { LegalService } = await import('./legal.service');
    const prisma = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({
          ...draftRow,
          currentPublication: publicationRow,
        }),
      },
    };
    const service = new LegalService(prisma as never, {} as never);

    await expect(service.getSettings(systemAdmin)).resolves.toEqual({
      draft: {
        operatorName: draftRow.operatorName,
        contactAddress: draftRow.contactAddress,
        privacyContact: draftRow.privacyContact,
        contactPhone: draftRow.contactPhone,
        contactEmail: draftRow.contactEmail,
        privacyVersion: draftRow.privacyVersion,
        agreementVersion: draftRow.agreementVersion,
        effectiveDate: '2026-07-14',
        privacyPolicyText: draftRow.privacyPolicyText,
        userAgreementText: draftRow.userAgreementText,
      },
      currentPublication: {
        id: publicationRow.id,
        privacyVersion: publicationRow.privacyVersion,
        agreementVersion: publicationRow.agreementVersion,
        effectiveDate: '2026-07-14',
        publishedAt: '2026-07-14T09:00:00.000Z',
      },
    });
    expect(prisma.legalSettings.findUnique).toHaveBeenCalledWith({
      where: { tenantId: systemAdmin.tenantId },
      include: { currentPublication: true },
    });
  });

  it('saves a complete tenant draft without changing the current publication pointer', async () => {
    const { LegalService } = await import('./legal.service');
    const upsert = vi.fn().mockResolvedValue({
      ...draftRow,
      currentPublication: publicationRow,
    });
    const service = new LegalService({ legalSettings: { upsert } } as never, {} as never);

    await expect(service.saveDraft(systemAdmin, draftInput)).resolves.toEqual({
      draft: draftInput,
      currentPublication: {
        id: publicationRow.id,
        privacyVersion: publicationRow.privacyVersion,
        agreementVersion: publicationRow.agreementVersion,
        effectiveDate: '2026-07-14',
        publishedAt: '2026-07-14T09:00:00.000Z',
      },
    });
    const storedDraft = {
      ...draftInput,
      effectiveDate: new Date('2026-07-14T00:00:00.000Z'),
    };
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: systemAdmin.tenantId },
      create: { tenantId: systemAdmin.tenantId, ...storedDraft },
      update: storedDraft,
      include: { currentPublication: true },
    });
    expect(upsert.mock.calls[0]?.[0].update).not.toHaveProperty('currentPublicationId');
  });

  it('publishes an immutable snapshot and points the draft at it', async () => {
    const { LegalService } = await import('./legal.service');
    const transaction = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue(draftRow),
        update: vi.fn().mockResolvedValue({
          ...draftRow,
          currentPublicationId: publicationRow.id,
        }),
      },
      legalPublication: {
        create: vi.fn().mockResolvedValue(publicationRow),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    };
    const service = new LegalService(prisma as never, {} as never);

    await expect(service.publish(systemAdmin)).resolves.toEqual({
      id: publicationRow.id,
      privacyVersion: publicationRow.privacyVersion,
      agreementVersion: publicationRow.agreementVersion,
      effectiveDate: '2026-07-14',
      publishedAt: '2026-07-14T09:00:00.000Z',
    });
    expect(transaction.legalSettings.findUnique).toHaveBeenCalledWith({
      where: { tenantId: systemAdmin.tenantId },
    });
    expect(transaction.legalPublication.create).toHaveBeenCalledWith({
      data: {
        tenantId: systemAdmin.tenantId,
        ...draftInput,
        effectiveDate: draftRow.effectiveDate,
      },
    });
    expect(transaction.legalSettings.update).toHaveBeenCalledWith({
      where: { tenantId: systemAdmin.tenantId },
      data: { currentPublicationId: publicationRow.id },
    });
  });

  it('returns configured false without exposing the saved draft', async () => {
    const { LegalService } = await import('./legal.service');
    const findSettings = vi.fn().mockResolvedValue({ currentPublication: null });
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: systemAdmin.tenantId }),
      },
      legalSettings: { findUnique: findSettings },
    };
    const service = new LegalService(prisma as never, {} as never);

    await expect(service.getPublic({ tenantCode: 'DEMO' })).resolves.toEqual({
      configured: false,
      tenantId: systemAdmin.tenantId,
    });
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { code: 'DEMO' },
      select: { id: true },
    });
    expect(findSettings).toHaveBeenCalledWith({
      where: { tenantId: systemAdmin.tenantId },
      select: { currentPublication: true },
    });
  });

  it('resolves a public legal publication through an enabled WeChat AppID', async () => {
    const { LegalService } = await import('./legal.service');
    const prisma = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({ currentPublication: publicationRow }),
      },
    };
    const integrations = {
      findEnabledWechatTenantId: vi.fn().mockResolvedValue(systemAdmin.tenantId),
    };
    const service = new LegalService(prisma as never, integrations as never);

    await expect(service.getPublic({ appId: 'wx-example' })).resolves.toEqual({
      configured: true,
      tenantId: systemAdmin.tenantId,
      publicationId: publicationRow.id,
      operatorName: publicationRow.operatorName,
      contactAddress: publicationRow.contactAddress,
      privacyContact: publicationRow.privacyContact,
      contactPhone: publicationRow.contactPhone,
      contactEmail: publicationRow.contactEmail,
      privacyVersion: publicationRow.privacyVersion,
      agreementVersion: publicationRow.agreementVersion,
      effectiveDate: '2026-07-14',
      privacyPolicyText: publicationRow.privacyPolicyText,
      userAgreementText: publicationRow.userAgreementText,
      publishedAt: '2026-07-14T09:00:00.000Z',
    });
    expect(integrations.findEnabledWechatTenantId).toHaveBeenCalledWith('wx-example');
  });

  it('rejects mismatched tenantCode and appId without leaking either tenant', async () => {
    const { LegalService } = await import('./legal.service');
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: systemAdmin.tenantId }),
      },
      legalSettings: { findUnique: vi.fn() },
    };
    const integrations = {
      findEnabledWechatTenantId: vi.fn().mockResolvedValue('44444444-4444-4444-8444-444444444444'),
    };
    const service = new LegalService(prisma as never, integrations as never);

    await expect(service.getPublic({ tenantCode: 'DEMO', appId: 'wx-other' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.legalSettings.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown public tenant lookup', async () => {
    const { LegalService } = await import('./legal.service');
    const service = new LegalService({} as never, {
      findEnabledWechatTenantId: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(service.getPublic({ appId: 'wx-missing' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns only the published privacy contact details for lifecycle errors', async () => {
    const { LegalService } = await import('./legal.service');
    const findUnique = vi.fn().mockResolvedValue({
      currentPublication: {
        privacyContact: '数据保护负责人',
        contactPhone: '0571-12345678',
        contactEmail: 'privacy@example.com',
      },
    });
    const service = new LegalService({
      legalSettings: { findUnique },
    } as never, {} as never);

    await expect(service.getPrivacyContact(systemAdmin.tenantId)).resolves.toBe(
      '数据保护负责人，0571-12345678，privacy@example.com',
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { tenantId: systemAdmin.tenantId },
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
  });

  it('loads the exact current publication inside the supplied transaction', async () => {
    const { LegalService } = await import('./legal.service');
    const db = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({ currentPublicationId: publicationRow.id }),
      },
      legalPublication: {
        findFirst: vi.fn().mockResolvedValue(publicationRow),
      },
    };
    const service = new LegalService({} as never, {} as never);

    await expect(service.requireCurrentPublication(
      systemAdmin.tenantId,
      publicationRow.id,
      db as never,
    )).resolves.toBe(publicationRow);
    expect(db.legalPublication.findFirst).toHaveBeenCalledWith({
      where: { id: publicationRow.id, tenantId: systemAdmin.tenantId },
    });
  });

  it('rejects missing, stale, and cross-tenant publication acceptance', async () => {
    const { LegalService } = await import('./legal.service');
    const service = new LegalService({} as never, {} as never);
    const noPublication = {
      legalSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    await expect(service.requireCurrentPublication(
      systemAdmin.tenantId,
      publicationRow.id,
      noPublication as never,
    )).rejects.toThrow('当前机构尚未发布协议');

    const stale = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({
          currentPublicationId: '55555555-5555-4555-8555-555555555555',
        }),
      },
    };
    await expect(service.requireCurrentPublication(
      systemAdmin.tenantId,
      publicationRow.id,
      stale as never,
    )).rejects.toThrow('协议版本已更新，请重新阅读并同意');

    const mismatched = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({ currentPublicationId: publicationRow.id }),
      },
      legalPublication: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(service.requireCurrentPublication(
      systemAdmin.tenantId,
      publicationRow.id,
      mismatched as never,
    )).rejects.toThrow('协议版本与当前机构不匹配');
  });

  it('creates idempotent miniapp consent with the exact published versions', async () => {
    const { LegalService } = await import('./legal.service');
    const upsert = vi.fn().mockResolvedValue({});
    const db = { legalConsent: { upsert } };
    const service = new LegalService({} as never, {} as never);

    await service.createConsent(db as never, {
      tenantId: systemAdmin.tenantId,
      userId: 'user-1',
      publication: publicationRow,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_publicationId_client: {
          userId: 'user-1',
          publicationId: publicationRow.id,
          client: 'miniapp',
        },
      },
      create: {
        tenantId: systemAdmin.tenantId,
        userId: 'user-1',
        publicationId: publicationRow.id,
        privacyVersion: publicationRow.privacyVersion,
        agreementVersion: publicationRow.agreementVersion,
        client: 'miniapp',
      },
      update: {},
    });
  });

  it('records consent only after rechecking the current publication in one transaction', async () => {
    const { LegalService } = await import('./legal.service');
    const transaction = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({ currentPublicationId: publicationRow.id }),
      },
      legalPublication: {
        findFirst: vi.fn().mockResolvedValue(publicationRow),
      },
      legalConsent: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    };
    const service = new LegalService(prisma as never, {} as never);

    await service.recordConsent({
      tenantId: systemAdmin.tenantId,
      userId: 'user-1',
      publicationId: publicationRow.id,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.legalConsent.upsert).toHaveBeenCalledTimes(1);
  });

  it('maps a duplicate published version pair to a conflict', async () => {
    const { LegalService } = await import('./legal.service');
    const service = new LegalService({
      $transaction: vi.fn().mockRejectedValue({ code: 'P2002' }),
    } as never, {} as never);

    await expect(service.publish(systemAdmin)).rejects.toMatchObject({
      message: '协议版本号已发布，请更新版本号后重试',
    } satisfies Partial<ConflictException>);
  });

  it('rejects publication before a draft has been saved', async () => {
    const { LegalService } = await import('./legal.service');
    const transaction = {
      legalSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const service = new LegalService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    } as never, {} as never);

    await expect(service.publish(systemAdmin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a client validation error for an invalid stored draft', async () => {
    const { LegalService } = await import('./legal.service');
    const transaction = {
      legalSettings: {
        findUnique: vi.fn().mockResolvedValue({
          ...draftRow,
          privacyPolicyText: '过短',
        }),
      },
    };
    const service = new LegalService({
      $transaction: vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction)),
    } as never, {} as never);

    await expect(service.publish(systemAdmin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the administrator fallback when no publication exists', async () => {
    const { LegalService } = await import('./legal.service');
    const service = new LegalService({
      legalSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never, {} as never);

    await expect(service.getPrivacyContact(systemAdmin.tenantId))
      .resolves.toBe('请联系机构管理员');
  });
});
