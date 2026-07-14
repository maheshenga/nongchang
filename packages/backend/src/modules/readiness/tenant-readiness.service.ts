import { Injectable } from '@nestjs/common';
import type { AuthUser, TenantReadinessView } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTenantReadiness } from './tenant-readiness.model';

const REQUIRED_INTEGRATIONS = ['wechat', 'tianditu', 'alipay'] as const;

function hasConfiguredContact(value: string | undefined): boolean {
  const normalized = value?.trim();
  return Boolean(normalized && normalized.toLowerCase() !== 'undefined');
}

function hasPublicHttpsUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !hostname.includes('replace_me')
      && hostname !== 'localhost'
      && hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

@Injectable()
export class TenantReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actor: AuthUser): Promise<TenantReadinessView> {
    const tenantId = actor.tenantId;
    const [legal, integrations, oss, ai, quota] = await Promise.all([
      this.prisma.legalSettings.findUnique({
        where: { tenantId },
        select: { currentPublicationId: true },
      }),
      this.prisma.integrationConfig.findMany({
        where: {
          tenantId,
          provider: { in: [...REQUIRED_INTEGRATIONS] },
          enabled: true,
        },
        select: { provider: true, enabled: true },
      }),
      this.prisma.ossConfig.findUnique({
        where: { tenantId },
        select: { enabled: true },
      }),
      this.prisma.aiProvider.findFirst({
        where: { tenantId, enabled: true },
        select: { id: true },
      }),
      this.prisma.creditAccount.findFirst({
        where: {
          tenantId,
          OR: [{ aiBalance: { gt: 0 } }, { codeBalance: { gt: 0 } }],
        },
        select: { id: true },
      }),
    ]);
    const enabledIntegrations = new Set(
      integrations.filter((item) => item.enabled).map((item) => item.provider),
    );

    return buildTenantReadiness({
      legal: Boolean(legal?.currentPublicationId),
      wechat: enabledIntegrations.has('wechat'),
      oss: Boolean(oss?.enabled),
      map: enabledIntegrations.has('tianditu'),
      ai: Boolean(ai),
      payment: enabledIntegrations.has('alipay'),
      quota: Boolean(quota),
      apiDomain: hasPublicHttpsUrl(process.env.PUBLIC_BASE_URL),
      supportContact: hasConfiguredContact(process.env.PUBLIC_SUPPORT_CONTACT),
      salesContact: hasConfiguredContact(process.env.PUBLIC_SALES_CONTACT),
    });
  }
}
