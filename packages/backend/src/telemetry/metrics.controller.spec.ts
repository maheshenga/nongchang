import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  const metrics = {
    exposition: vi.fn().mockResolvedValue('# metrics'),
    contentType: 'text/plain; version=0.0.4',
  };

  it('requires the configured bearer credential and returns Prometheus text', async () => {
    const controller = new MetricsController(metrics as never, { metricsBearerToken: 'x'.repeat(24) } as never);
    const response = { type: vi.fn() };

    await expect(controller.exposition(response as never, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.exposition(response as never, `Bearer ${'x'.repeat(24)}`)).resolves.toBe('# metrics');
    expect(response.type).toHaveBeenCalledWith(metrics.contentType);
  });

  it('is public at the JWT layer so Prometheus authentication is handled locally', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, MetricsController.prototype.exposition)).toBe(true);
  });
});
