import { Injectable, BadRequestException } from '@nestjs/common';
import type { AuthUser, OssConfigInput, OssConfigView, AiTestResponse } from '@nongchang/shared';
import OSS from 'ali-oss';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

const OSS_TEST_TIMEOUT_MS = 10_000;

interface OssConfigRow {
  id: string;
  tenantId: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecEnc: string;
  baseUrl: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OssCredentials {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  baseUrl: string | null;
}

@Injectable()
export class OssConfigService {
  constructor(private prisma: PrismaService, private enc: EncryptionService) {}

  private toView(r: OssConfigRow): OssConfigView {
    return {
      region: r.region,
      bucket: r.bucket,
      accessKeyId: r.accessKeyId,
      accessKeySecretMasked: this.enc.maskSecret(this.enc.decrypt(r.accessKeySecEnc)),
      baseUrl: r.baseUrl ?? null,
      enabled: r.enabled,
    };
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

    const create = {
      tenantId: user.tenantId,
      region: dto.region,
      bucket: dto.bucket,
      accessKeyId: dto.accessKeyId,
      accessKeySecEnc: secretEnc,
      baseUrl: dto.baseUrl ?? null,
      enabled,
    };

    const update: Record<string, unknown> = {
      region: dto.region,
      bucket: dto.bucket,
      accessKeyId: dto.accessKeyId,
      baseUrl: dto.baseUrl ?? null,
      enabled,
    };
    if (dto.accessKeySecret) {
      update.accessKeySecEnc = secretEnc;
    }

    const row = (await this.prisma.ossConfig.upsert({
      where: { tenantId: user.tenantId },
      create,
      update,
    })) as OssConfigRow;

    return this.toView(row);
  }

  async getCredentials(tenantId: string): Promise<OssCredentials | null> {
    const row = (await this.prisma.ossConfig.findUnique({
      where: { tenantId },
    })) as OssConfigRow | null;
    if (!row || !row.enabled) return null;
    return {
      region: row.region,
      bucket: row.bucket,
      accessKeyId: row.accessKeyId,
      accessKeySecret: this.enc.decrypt(row.accessKeySecEnc),
      baseUrl: row.baseUrl ?? null,
    };
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
