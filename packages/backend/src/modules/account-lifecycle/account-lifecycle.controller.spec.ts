import { StreamableFile } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { describe, expect, it, vi } from 'vitest';
import { AccountLifecycleController } from './account-lifecycle.controller';

const actor: AuthUser = {
  userId: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'u1',
};

describe('AccountLifecycleController', () => {
  it('passes the authenticated actor to the live preview service', async () => {
    const preview = { generatedAt: '2026-07-14T00:00:00.000Z' };
    const service = { preview: vi.fn().mockResolvedValue(preview), export: vi.fn() };
    const controller = new AccountLifecycleController(service as never, {} as never);

    await expect(controller.preview(actor)).resolves.toBe(preview);
    expect(service.preview).toHaveBeenCalledWith(actor);
  });

  it('returns the JSON export as a length-delimited attachment', async () => {
    const body = Buffer.from('{"schemaVersion":1}', 'utf8');
    const service = {
      preview: vi.fn(),
      export: vi.fn().mockResolvedValue({ fileName: 'account-data.json', body }),
    };
    const response = { setHeader: vi.fn() };
    const controller = new AccountLifecycleController(service as never, {} as never);

    const result = await controller.export(actor, response as never);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(service.export).toHaveBeenCalledWith(actor);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type', 'application/json; charset=utf-8',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition', 'attachment; filename="account-data.json"',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', String(body.byteLength));
  });

  it('passes validated strong proof to closure and returns no body', async () => {
    const lifecycle = { close: vi.fn().mockResolvedValue(undefined) };
    const controller = new AccountLifecycleController({} as never, lifecycle as never);
    const input = {
      method: 'password' as const,
      currentPassword: 'password123',
      confirmation: '注销账号' as const,
    };

    await expect(controller.close(actor, input)).resolves.toBeUndefined();
    expect(lifecycle.close).toHaveBeenCalledWith(actor, input);
  });
});
