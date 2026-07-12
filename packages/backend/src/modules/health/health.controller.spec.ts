import 'reflect-metadata';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const service = {
    live: vi.fn().mockReturnValue({ status: 'ok', uptimeSeconds: 1, version: '1.0.0' }),
    ready: vi.fn().mockResolvedValue({ status: 'ready' }),
  };
  const controller = new HealthController(service as never);

  it('delegates liveness and readiness checks', async () => {
    expect(controller.live()).toEqual({ status: 'ok', uptimeSeconds: 1, version: '1.0.0' });
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });

  it('marks both routes public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.live)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.ready)).toBe(true);
  });

  it('applies an explicit 60 requests/minute throttle', () => {
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, HealthController)).toBe(60);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, HealthController)).toBe(60_000);
  });
});
