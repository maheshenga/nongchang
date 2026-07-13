import { describe, expect, it, vi } from 'vitest';
import { OperationsAuditService } from './operations-audit.service';

describe('OperationsAuditService', () => {
  it('returns bounded operational counts without row payloads', async () => {
    const setDatabasePoolSaturationRatio = vi.fn();
    const prisma = {
      aiOperation: { count: vi.fn().mockResolvedValue(3) },
      uploadAsset: { count: vi.fn().mockResolvedValue(2) },
      creditReservation: { count: vi.fn().mockResolvedValue(1) },
      $queryRaw: vi.fn().mockResolvedValue([{ active: 6n }]),
    };
    const service = new OperationsAuditService(prisma as never, { setDatabasePoolSaturationRatio } as never);

    await expect(service.run(new Date('2026-07-13T00:00:00.000Z'))).resolves.toEqual({
      staleAiOperations: 3,
      staleUploadAssets: 2,
      staleCreditReservations: 1,
      status: 'attention',
    });
    expect(setDatabasePoolSaturationRatio).toHaveBeenCalledWith(0.3);
  });
});
