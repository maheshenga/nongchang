import { describe, expect, it, vi } from 'vitest';
import { Role } from '@nongchang/shared';
import { UploadController } from './upload.controller';

describe('UploadController', () => {
  it('passes upload purpose query to UploadService', async () => {
    const service = { upload: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/credentials/report.pdf' }) };
    const controller = new UploadController(service as any);
    const file = { originalname: 'report.pdf', mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('%PDF-1.7\n') };
    const user = { userId: 'u1', tenantId: 'tenant-1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };

    await (controller.upload as any)(file, user, 'credential');

    expect(service.upload).toHaveBeenCalledWith(file, user, { purpose: 'credential' });
  });
});
