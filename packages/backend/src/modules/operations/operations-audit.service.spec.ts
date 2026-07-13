import { describe, expect, it, vi } from 'vitest';
import { OperationsAuditService } from './operations-audit.service';

describe('OperationsAuditService', () => {
  it('returns bounded operational counts without row payloads', async () => {
    const prisma = {
      aiOperation: { count: vi.fn().mockResolvedValue(3) },
      uploadAsset: { count: vi.fn().mockResolvedValue(2) },
      creditReservation: { count: vi.fn().mockResolvedValue(1) },
    };
    const service = new OperationsAuditService(prisma as never);

    await expect(service.run(new Date('2026-07-13T00:00:00.000Z'))).resolves.toEqual({
      staleAiOperations: 3,
      staleUploadAssets: 2,
      staleCreditReservations: 1,
      status: 'attention',
    });
  });
});
