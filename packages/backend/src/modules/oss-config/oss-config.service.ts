import { Injectable, BadRequestException } from '@nestjs/common';
import type { AuthUser, OssConfigInput, OssConfigView, AiTestResponse } from '@nongchang/shared';
import OSS from 'ali-oss';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  buildOssConfigView,
  buildOssCredentials,
  buildOssUpsertArgs,
  canUseOssCredentials,
  type OssConfigRow,
  type OssCredentials,
} from './oss-config.model';

const OSS_TEST_TIMEOUT_MS = 10_000;
export type { OssCredentials } from './oss-config.model';

@Injectable()
export class OssConfigService {
  constructor(private prisma: PrismaService, private enc: EncryptionService) {}

  private toView(r: OssConfigRow): OssConfigView {
    return buildOssConfigView({
      row: r,
      accessKeySecretMasked: this.enc.maskSecret(this.enc.decrypt(r.accessKeySecEnc)),
    });
  }

  async get(user: AuthUser): Promise<OssConfigView | null> {
    const row = (await this.prisma.ossConfig.findUnique({
      where: { tenantId: user.tenantId },
    })) as OssConfigRow | null;
    return row ? this.toView(row) : null;
  }

  async upsert(user: AuthUser, dto: OssConfigInput): Promise<OssConfigView> {
    const existing = (await this.prisma.ossConfig.findUnique({
      where: { tenantId: user.tenantId },
    })) as OssConfigRow | null;

    if (!existing && !dto.accessKeySecret) {
      throw new BadRequestException('首次配置需提供 accessKeySecret');
    }

    const enabled = dto.enabled ?? existing?.enabled ?? false;

    // 仅当 secret 有值时加密；首次配置必有 secret(上方已校验)
    const secretEnc = dto.accessKeySecret ? this.enc.encrypt(dto.accessKeySecret) : '';

    const row = (await this.prisma.ossConfig.upsert(buildOssUpsertArgs({
      tenantId: user.tenantId,
      region: dto.region,
      bucket: dto.bucket,
      accessKeyId: dto.accessKeyId,
      baseUrl: dto.baseUrl ?? null,
      accessKeySecEnc: secretEnc,
      enabled,
    }))) as OssConfigRow;

    return this.toView(row);
  }

  async getCredentials(tenantId: string): Promise<OssCredentials | null> {
    const row = (await this.prisma.ossConfig.findUnique({
      where: { tenantId },
    })) as OssConfigRow | null;
    if (!canUseOssCredentials(row)) return null;
    return buildOssCredentials({
      row,
      accessKeySecret: this.enc.decrypt(row.accessKeySecEnc),
    });
  }

  async test(user: AuthUser): Promise<AiTestResponse> {
    const cred = await this.getCredentials(user.tenantId);
    if (!cred) return { ok: false, error: '未配置或未启用 OSS' };

    const start = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const client = new OSS({
        region: cred.region,
        bucket: cred.bucket,
        accessKeyId: cred.accessKeyId,
        accessKeySecret: cred.accessKeySecret,
        timeout: OSS_TEST_TIMEOUT_MS,
      });
      // 轻量探测连通性，限制只取 1 个对象
      const racePromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), OSS_TEST_TIMEOUT_MS);
      });
      await Promise.race([client.list({ 'max-keys': 1 }, {}), racePromise]);
      const latencyMs = Date.now() - start;
      return { ok: true, latencyMs };
    } catch {
      // 不泄露 accessKeySecret：仅返回通用文案
      return { ok: false, error: '连接失败' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
