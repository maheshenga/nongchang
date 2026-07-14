import { Injectable, BadRequestException } from '@nestjs/common';
import type {
  AuthUser, IntegrationConfigView, IntegrationProvider,
  WechatConfigInput, XfyunConfigInput, TiandituConfigInput,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  buildIntegrationConfigView,
  buildTiandituUpsertArgs,
  buildWechatUpsertArgs,
  buildXfyunUpsertArgs,
  canUseWechatTenant,
  canUseXfyunCredentials,
  resolveEnabledTiandituKey,
  type IntegrationRow,
} from './integration-config.model';

export interface WechatTenantLookup {
  tenantId: string;
  secret: string;
}

export interface XfyunCredentials {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

@Injectable()
export class IntegrationConfigService {
  constructor(private prisma: PrismaService, private enc: EncryptionService) {}

  private maskOrNull(encVal: string | null): string | null {
    return encVal ? this.enc.maskSecret(this.enc.decrypt(encVal)) : null;
  }

  private toView(r: IntegrationRow): IntegrationConfigView {
    return buildIntegrationConfigView({
      row: r,
      secretMasked: this.maskOrNull(r.secretEnc),
      apiKeyMasked: this.maskOrNull(r.apiKeyEnc),
      apiSecretMasked: this.maskOrNull(r.apiSecretEnc),
    });
  }

  private async findRow(tenantId: string, provider: IntegrationProvider): Promise<IntegrationRow | null> {
    return (await this.prisma.integrationConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    })) as IntegrationRow | null;
  }

  async getView(user: AuthUser, provider: IntegrationProvider): Promise<IntegrationConfigView | null> {
    const row = await this.findRow(user.tenantId, provider);
    return row ? this.toView(row) : null;
  }

  async upsertWechat(user: AuthUser, dto: WechatConfigInput): Promise<IntegrationConfigView> {
    const existing = await this.findRow(user.tenantId, 'wechat');
    if (!existing && !dto.secret) {
      throw new BadRequestException('首次配置需提供微信 Secret');
    }
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    const secretEnc = dto.secret ? this.enc.encrypt(dto.secret) : null;

    const row = (await this.prisma.integrationConfig.upsert(buildWechatUpsertArgs({
      tenantId: user.tenantId,
      appId: dto.appId,
      enabled,
      secretEnc,
    }))) as IntegrationRow;
    return this.toView(row);
  }

  async upsertXfyun(user: AuthUser, dto: XfyunConfigInput): Promise<IntegrationConfigView> {
    const existing = await this.findRow(user.tenantId, 'xfyun');
    if (!existing && (!dto.apiKey || !dto.apiSecret)) {
      throw new BadRequestException('首次配置需提供讯飞 APIKey 与 APISecret');
    }
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    const apiKeyEnc = dto.apiKey ? this.enc.encrypt(dto.apiKey) : null;
    const apiSecretEnc = dto.apiSecret ? this.enc.encrypt(dto.apiSecret) : null;

    const row = (await this.prisma.integrationConfig.upsert(buildXfyunUpsertArgs({
      tenantId: user.tenantId,
      appId: dto.appId,
      enabled,
      apiKeyEnc,
      apiSecretEnc,
    }))) as IntegrationRow;
    return this.toView(row);
  }

  // 天地图:key 存明文 appId 字段(前端可见,无需加密),仅 enabled 时对前端可读。
  async upsertTianditu(user: AuthUser, dto: TiandituConfigInput): Promise<IntegrationConfigView> {
    const enabled = dto.enabled ?? false;
    const row = (await this.prisma.integrationConfig.upsert(buildTiandituUpsertArgs({
      tenantId: user.tenantId,
      key: dto.key,
      enabled,
    }))) as IntegrationRow;
    return this.toView(row);
  }

  // 前端加载地图脚本:取本租户启用中的天地图 key(未配置/未启用则 null)
  async getEnabledTiandituKey(tenantId: string): Promise<string | null> {
    const row = await this.findRow(tenantId, 'tianditu');
    return resolveEnabledTiandituKey(row);
  }

  // 微信登录:用 appId 全局反查租户 + 解密 secret(仅启用)
  async findTenantByWechatAppId(appId: string): Promise<WechatTenantLookup | null> {
    const row = (await this.prisma.integrationConfig.findFirst({
      where: { appId, provider: 'wechat' },
    })) as IntegrationRow | null;
    if (!canUseWechatTenant(row)) return null;
    return { tenantId: row.tenantId, secret: this.enc.decrypt(row.secretEnc) };
  }

  async findEnabledWechatTenantId(appId: string): Promise<string | null> {
    const row = await this.prisma.integrationConfig.findFirst({
      where: { provider: 'wechat', appId, enabled: true },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }

  // 讯飞内部调用:解密凭证(仅启用)
  async getEnabledXfyun(tenantId: string): Promise<XfyunCredentials | null> {
    const row = await this.findRow(tenantId, 'xfyun');
    if (!canUseXfyunCredentials(row)) return null;
    return {
      appId: row.appId,
      apiKey: this.enc.decrypt(row.apiKeyEnc),
      apiSecret: this.enc.decrypt(row.apiSecretEnc),
    };
  }
}
