import { describe, expect, it, vi } from 'vitest';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PublicLegalController } from './public-legal.controller';

describe('PublicLegalController', () => {
  it('is public and independently throttled', () => {
    const handler = PublicLegalController.prototype.get;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(
      process.env.NODE_ENV === 'test' ? 100_000 : 60,
    );
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
  });

  it('delegates the normalized public lookup to the legal service', async () => {
    const legal = {
      getPublic: vi.fn().mockResolvedValue({
        configured: false,
        tenantId: '11111111-1111-4111-8111-111111111111',
      }),
    };
    const controller = new PublicLegalController(legal as never);

    await expect(controller.get({ tenantCode: 'DEMO' })).resolves.toEqual({
      configured: false,
      tenantId: '11111111-1111-4111-8111-111111111111',
    });
    expect(legal.getPublic).toHaveBeenCalledWith({ tenantCode: 'DEMO' });
  });
});
