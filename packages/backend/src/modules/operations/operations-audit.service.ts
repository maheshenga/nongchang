import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OperationsAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async run(cutoff: Date) {
    const [staleAiOperations, staleUploadAssets, staleCreditReservations] = await Promise.all([
      this.prisma.aiOperation.count({
        where: {
          createdAt: { lt: cutoff },
          status: { in: ['RESERVED', 'FAILED', 'SUCCEEDED', 'IN_FLIGHT', 'REVIEW_REQUIRED'] },
        },
      }),
      this.prisma.uploadAsset.count({ where: { createdAt: { lt: cutoff }, status: 'PENDING' } }),
      this.prisma.creditReservation.count({ where: { createdAt: { lt: cutoff }, status: 'RESERVED' } }),
    ]);
    return {
      staleAiOperations,
      staleUploadAssets,
      staleCreditReservations,
      status: staleAiOperations + staleUploadAssets + staleCreditReservations > 0 ? 'attention' : 'ok',
    } as const;
  }
}
