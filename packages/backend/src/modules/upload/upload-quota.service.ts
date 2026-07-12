import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readUploadQuotaLimits } from './upload-quota.config';
import {
  UploadQuotaExceededError,
  applyUploadRelease,
  applyUploadReservation,
  utcDayKey,
  type UploadAssetState,
} from './upload-quota.model';

export interface UploadReservationInput {
  tenantId: string;
  userId: string;
  purpose: string;
  objectKey: string;
  sizeBytes: bigint;
  checksum: string;
}

@Injectable()
export class UploadQuotaService {
  constructor(private prisma: PrismaService) {}

  async reserve(input: UploadReservationInput): Promise<{ assetId: string }> {
    const now = new Date();
    const dayKey = utcDayKey(now);
    const limits = readUploadQuotaLimits();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.uploadQuotaUsage.upsert({
          where: { tenantId: input.tenantId },
          create: { tenantId: input.tenantId, dayKey, dailyBytes: 0n, activeBytes: 0n },
          update: {},
        });
        await tx.$queryRaw`SELECT tenant_id FROM upload_quota_usage WHERE tenant_id = ${input.tenantId} FOR UPDATE`;
        const usage = await tx.uploadQuotaUsage.findUniqueOrThrow({ where: { tenantId: input.tenantId } });
        const next = applyUploadReservation({
          usageDayKey: usage.dayKey,
          currentDayKey: dayKey,
          dailyBytes: usage.dailyBytes,
          activeBytes: usage.activeBytes,
          sizeBytes: input.sizeBytes,
          dailyLimitBytes: limits.dailyLimitBytes,
          activeLimitBytes: limits.activeLimitBytes,
        });
        await tx.uploadQuotaUsage.update({
          where: { tenantId: input.tenantId },
          data: next,
        });
        const asset = await tx.uploadAsset.create({
          data: {
            tenantId: input.tenantId,
            userId: input.userId,
            purpose: input.purpose,
            objectKey: input.objectKey,
            sizeBytes: input.sizeBytes,
            checksum: input.checksum,
            status: 'PENDING',
          },
          select: { id: true },
        });
        return { assetId: asset.id };
      });
    } catch (error) {
      if (!(error instanceof UploadQuotaExceededError)) throw error;
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'UPLOAD_QUOTA_EXCEEDED',
        scope: error.scope,
        limitBytes: Number(error.limitBytes),
        usedBytes: Number(error.usedBytes),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async activate(assetId: string, url: string): Promise<void> {
    const result = await this.prisma.uploadAsset.updateMany({
      where: { id: assetId, status: 'PENDING' },
      data: { status: 'ACTIVE', url },
    });
    if (result.count !== 1) throw new Error('Upload asset is not pending');
  }

  async release(assetId: string, targetStatus: 'FAILED' | 'DELETED'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM upload_assets WHERE id = ${assetId} FOR UPDATE`;
      const asset = await tx.uploadAsset.findUnique({ where: { id: assetId } });
      if (!asset) return;
      await tx.$queryRaw`SELECT tenant_id FROM upload_quota_usage WHERE tenant_id = ${asset.tenantId} FOR UPDATE`;
      const usage = await tx.uploadQuotaUsage.findUnique({ where: { tenantId: asset.tenantId } });
      if (!usage) return;
      const next = applyUploadRelease({
        assetStatus: asset.status as UploadAssetState,
        assetDayKey: utcDayKey(asset.createdAt),
        usageDayKey: usage.dayKey,
        dailyBytes: usage.dailyBytes,
        activeBytes: usage.activeBytes,
        sizeBytes: asset.sizeBytes,
      });
      if (!next.changed) return;
      await tx.uploadQuotaUsage.update({
        where: { tenantId: asset.tenantId },
        data: { dailyBytes: next.dailyBytes, activeBytes: next.activeBytes },
      });
      await tx.uploadAsset.update({ where: { id: assetId }, data: { status: targetStatus } });
    });
  }

  async listStalePending(olderThan: Date, limit: number) {
    return this.prisma.uploadAsset.findMany({
      where: { status: 'PENDING', createdAt: { lt: olderThan } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, tenantId: true, objectKey: true, sizeBytes: true, createdAt: true },
    });
  }
}
