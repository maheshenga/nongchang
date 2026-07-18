import { Controller, Get, Headers, Inject, Res, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';
import { TELEMETRY_CONFIG, type TelemetryConfig } from './telemetry.config';

function credentialMatches(header: string | undefined, expected: string): boolean {
  const actual = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(TELEMETRY_CONFIG) private readonly config: TelemetryConfig,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  async exposition(@Res({ passthrough: true }) response: Response, @Headers('authorization') authorization?: string) {
    if (this.config.metricsBearerToken && !credentialMatches(authorization, this.config.metricsBearerToken)) {
      throw new UnauthorizedException('metrics credential required');
    }
    response.type(this.metrics.contentType);
    return this.metrics.exposition();
  }
}
