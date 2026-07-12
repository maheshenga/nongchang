import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Role, type AuthUser, type UploadResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { OssService } from './oss.service';
import {
  buildUploadObjectKey,
  calculateUploadChecksum,
  validateUploadFile,
} from './upload.model';
import type { UploadedFile, UploadPurpose } from './upload.model';
import { UploadQuotaService } from './upload-quota.service';

export interface UploadOptions {
  purpose?: UploadPurpose | string;
}

export type { UploadedFile };

@Injectable()
export class UploadService {
  constructor(
    private oss: OssService,
    private prisma: PrismaService,
    private quota: UploadQuotaService,
  ) {}

  async upload(file: UploadedFile, user: AuthUser, options: UploadOptions = {}): Promise<UploadResponse> {
    const validation = validateUploadFile({ file, purpose: options.purpose });
    if (!validation.ok) throw new BadRequestException(validation.message);
    await this.assertPurposeAuthorized(user, validation.purpose);

    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const key = buildUploadObjectKey({
      tenantId: user.tenantId,
      purpose: validation.purpose,
      yyyymm,
      id: randomUUID(),
      ext: validation.ext,
    });
    const checksum = calculateUploadChecksum(file.buffer);
    const { assetId } = await this.quota.reserve({
      tenantId: user.tenantId,
      userId: user.userId,
      purpose: validation.purpose,
      objectKey: key,
      sizeBytes: BigInt(file.size),
      checksum,
    });

    let url: string;
    try {
      url = await this.oss.put(key, file.buffer, user.tenantId);
    } catch (error) {
      try { await this.quota.release(assetId, 'FAILED'); } catch { /* reconciliation handles leftovers */ }
      throw error;
    }
    try {
      await this.quota.activate(assetId, url);
    } catch (error) {
      try { await this.oss.delete(key, user.tenantId); } catch { /* cleanup command handles leftovers */ }
      try { await this.quota.release(assetId, 'FAILED'); } catch { /* reconciliation handles leftovers */ }
      throw error;
    }
    return { url };
  }

  private async assertPurposeAuthorized(user: AuthUser, purpose: UploadPurpose): Promise<void> {
    if (purpose === 'ai-diagnose') return;

    const bypassRoles: Role[] = [Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN];
    if (bypassRoles.includes(user.role)) return;
    if (purpose === 'credential') throw new ForbiddenException('无权上传资质文件');

    const row = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { group: { select: { permissions: true } } },
    }) as { group: { permissions: unknown } | null } | null;
    const permissions = row?.group?.permissions;
    if (!Array.isArray(permissions) || !permissions.includes('record:create')) {
      throw new ForbiddenException('用户组权限不足');
    }
  }
}
