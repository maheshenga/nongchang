import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readDatabaseRuntimeConfig } from '../../common/config/database-runtime.config';
import { MetricsService } from '../../telemetry/metrics.service';

@Injectable()
export class OperationsAuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async run(cutoff: Date) {
    const [staleAiOperations, staleUploadAssets, staleCreditReservations, connectionRows] = await Promise.all([
      this.prisma.aiOperation.count({
        where: {
          createdAt: { lt: cutoff },
          status: { in: ['RESERVED', 'FAILED', 'SUCCEEDED', 'IN_FLIGHT', 'REVIEW_REQUIRED'] },
        },
      }),
      this.prisma.uploadAsset.count({ where: { createdAt: { lt: cutoff }, status: 'PENDING' } }),
      this.prisma.creditReservation.count({ where: { createdAt: { lt: cutoff }, status: 'RESERVED' } }),
      this.prisma.$queryRaw<Array<{ active: bigint }>>`
        SELECT count(*)::bigint AS active
        FROM pg_stat_activity
        WHERE datname = current_database()
      `,
    ]);
    const activeConnections = Number(connectionRows[0]?.active ?? 0);
    this.metrics?.setDatabasePoolSaturationRatio(activeConnections / readDatabaseRuntimeConfig().poolMax);
    return {
      staleAiOperations,
      staleUploadAssets,
      staleCreditReservations,
      status: staleAiOperations + staleUploadAssets + staleCreditReservations > 0 ? 'attention' : 'ok',
    } as const;
  }
}
