import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns process liveness information', () => {
    const service = new HealthService({} as never);

    expect(service.live()).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
      version: expect.any(String),
    });
  });

  it('returns ready after PostgreSQL accepts SELECT 1', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ $queryRaw: queryRaw } as never);

    await expect(service.ready()).resolves.toEqual({ status: 'ready' });
    expect(Array.from(queryRaw.mock.calls[0][0] as TemplateStringsArray)).toEqual(['SELECT 1']);
  });

  it('returns a fail-closed 503 payload when PostgreSQL is unavailable', async () => {
    const service = new HealthService({ $queryRaw: vi.fn().mockRejectedValue(new Error('db down')) } as never);

    try {
      await service.ready();
      throw new Error('expected readiness failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({ status: 'not_ready' });
    }
  });
});
