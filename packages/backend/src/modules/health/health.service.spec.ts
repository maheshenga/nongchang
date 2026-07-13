import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const runtimeReady = { ping: vi.fn().mockResolvedValue(true) } as never;

  it('returns process liveness information', () => {
    const service = new HealthService({} as never, runtimeReady);

    expect(service.live()).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
      version: expect.any(String),
    });
  });

  it('returns ready after PostgreSQL and runtime state accept health probes', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ $queryRaw: queryRaw } as never, runtimeReady);

    await expect(service.ready()).resolves.toEqual({ status: 'ready' });
    expect(Array.from(queryRaw.mock.calls[0][0] as TemplateStringsArray)).toEqual(['SELECT 1']);
  });

  it('returns a fail-closed 503 payload when PostgreSQL is unavailable', async () => {
    const service = new HealthService(
      { $queryRaw: vi.fn().mockRejectedValue(new Error('db down')) } as never,
      runtimeReady,
    );

    try {
      await service.ready();
      throw new Error('expected readiness failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({ status: 'not_ready' });
    }
  });

  it('returns not-ready after application shutdown begins without querying dependencies', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const runtime = { ping: vi.fn().mockResolvedValue(true) };
    const service = new HealthService({ $queryRaw: queryRaw } as never, runtime as never);

    service.beforeApplicationShutdown();

    await expect(service.ready()).rejects.toMatchObject({
      response: { status: 'not_ready' },
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(runtime.ping).not.toHaveBeenCalled();
  });

  it('returns not-ready when distributed runtime state is unavailable', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const runtime = { ping: vi.fn().mockResolvedValue(false) };
    const service = new HealthService({ $queryRaw: queryRaw } as never, runtime as never);

    await expect(service.ready()).rejects.toMatchObject({
      response: { status: 'not_ready' },
    });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(runtime.ping).toHaveBeenCalledOnce();
  });
});
