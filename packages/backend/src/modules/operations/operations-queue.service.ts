import { Injectable, OnApplicationShutdown, OnModuleInit, Optional } from '@nestjs/common';
import { Job, Queue, Worker, type ConnectionOptions } from 'bullmq';
import { readRedisUrl, readRuntimeStateDriver } from '../../common/runtime/runtime-state.types';
import {
  OPERATIONS_QUEUE,
  type OperationsJobName,
  type OperationsJobPayload,
  readOperationsWorkerConcurrency,
} from './operations.constants';
import { OperationsProcessor } from './operations.processor';
import { MetricsService } from '../../telemetry/metrics.service';

@Injectable()
export class OperationsQueueService implements OnModuleInit, OnApplicationShutdown {
  private queue?: Queue<OperationsJobPayload, unknown, string>;
  private worker?: Worker<OperationsJobPayload, unknown, string>;

  constructor(
    private readonly processor: OperationsProcessor,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private enabled(): boolean {
    return readRuntimeStateDriver() === 'redis' && process.env.OPERATIONS_WORKERS_ENABLED === 'true';
  }

  private connectionOptions(): ConnectionOptions {
    const url = new URL(readRedisUrl());
    const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: Number.isInteger(db) ? db : 0,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled()) return;
    const connection = this.connectionOptions();
    this.queue = new Queue(OPERATIONS_QUEUE, { connection });
    this.worker = new Worker(
      OPERATIONS_QUEUE,
      (job: Job<OperationsJobPayload, unknown, string>) => {
        if (!['ai-reconcile', 'upload-cleanup', 'operational-audit'].includes(job.name)) {
          throw new Error(`unsupported operations job: ${job.name}`);
        }
        return this.processor.process(job.name as OperationsJobName, job.data);
      },
      {
        connection,
        concurrency: readOperationsWorkerConcurrency(),
      },
    );
    this.worker.on('error', () => undefined);
    this.worker.on('failed', (job) => {
      this.metrics?.recordQueueFailure({ queue: OPERATIONS_QUEUE, job: job?.name ?? 'other' });
      void this.refreshMetrics();
    });
    this.worker.on('completed', () => void this.refreshMetrics());
    await this.registerSchedules();
    await this.refreshMetrics();
  }

  private async refreshMetrics(): Promise<void> {
    if (!this.queue || !this.metrics) return;
    try {
      const [depth, jobs] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getJobs(['waiting', 'delayed'], 0, 0, true),
      ]);
      const oldestTimestamp = jobs[0]?.timestamp;
      this.metrics.setQueueState({
        queue: OPERATIONS_QUEUE,
        depth,
        oldestJobAgeSeconds: oldestTimestamp ? Math.max(0, (Date.now() - oldestTimestamp) / 1_000) : 0,
      });
    } catch {
      // Queue health is also covered by readiness; metrics collection must not crash workers.
    }
  }

  private async registerSchedules(): Promise<void> {
    const queue = this.queue!;
    await queue.upsertJobScheduler('ai-reconcile-hourly', { every: 60 * 60_000 }, {
      name: 'ai-reconcile',
      data: { olderThanMinutes: 60, limit: 100, dryRun: false },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 100, removeOnFail: 200 },
    });
    await queue.upsertJobScheduler('upload-cleanup-hourly', { every: 60 * 60_000 }, {
      name: 'upload-cleanup',
      data: { olderThanMinutes: 60, limit: 100, dryRun: false },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 100, removeOnFail: 200 },
    });
    await queue.upsertJobScheduler('operational-audit-15m', { every: 15 * 60_000 }, {
      name: 'operational-audit',
      data: { olderThanMinutes: 60, limit: 100, dryRun: true },
      opts: { attempts: 2, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 100, removeOnFail: 200 },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
