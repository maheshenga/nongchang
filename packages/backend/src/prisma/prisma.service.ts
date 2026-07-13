import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from '../telemetry/metrics.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() private readonly metrics?: MetricsService) {
    super();
    this.$use(async (params, next) => {
      const startedAt = performance.now();
      try {
        const result = await next(params);
        this.metrics?.observeDatabase({
          operation: params.action,
          status: 'ok',
          durationSeconds: (performance.now() - startedAt) / 1_000,
        });
        return result;
      } catch (error) {
        this.metrics?.observeDatabase({
          operation: params.action,
          status: 'error',
          durationSeconds: (performance.now() - startedAt) / 1_000,
        });
        throw error;
      }
    });
  }

  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
