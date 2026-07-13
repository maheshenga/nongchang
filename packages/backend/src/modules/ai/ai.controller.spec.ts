import { BadRequestException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { AiController } from './ai.controller';

const user: AuthUser = {
  userId: 'user-1', tenantId: 'tenant-1', role: Role.MERCHANT, agentId: null, ownerId: 'user-1',
};

describe('AiController idempotency contract', () => {
  it('passes the validated header to the service', async () => {
    const service = { chat: vi.fn().mockResolvedValue({ answer: 'ok' }) } as any;
    const controller = new AiController(service);

    await (controller.chat as any)(user, { message: 'hello' }, 'action_20260713-abc');

    expect(service.chat).toHaveBeenCalledWith(user, 'hello', 'action_20260713-abc');
  });

  it('rejects a missing header before starting billable work', async () => {
    const service = { chat: vi.fn() } as any;
    const controller = new AiController(service);

    expect(() => (controller.chat as any)(user, { message: 'hello' }, undefined))
      .toThrow(BadRequestException);
    expect(service.chat).not.toHaveBeenCalled();
  });
});
