import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from '../telemetry/metrics.service';

interface PrismaEventEmitter {
  $on(event: 'query', callback: (value: { duration: number }) => void): void;
  $on(event: 'error', callback: () => void): void;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() private readonly metrics?: MetricsService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
      ],
    });
    const events = this as unknown as PrismaEventEmitter;
    events.$on('query', (event) => this.metrics?.observeDatabase({
      operation: 'queryRaw',
      status: 'ok',
      durationSeconds: event.duration / 1_000,
    }));
    events.$on('error', () => this.metrics?.observeDatabase({
      operation: 'queryRaw',
      status: 'error',
      durationSeconds: 0,
    }));
  }

  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
