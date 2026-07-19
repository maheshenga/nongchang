import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker, type ConnectionOptions } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OperationsProcessor } from '../src/modules/operations/operations.processor';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:57379');
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  maxRetriesPerRequest: null,
};

describe('BullMQ operations queue integration', () => {
  const queueName = `platform-operations-e2e-${randomUUID()}`;
  const queue = new Queue(queueName, { connection });
  const events = new QueueEvents(queueName, { connection });
  const ai = { reconcileStale: vi.fn().mockResolvedValue({ scanned: 1, errors: [] }) };
  const processor = new OperationsProcessor(
    ai as never,
    { listStalePending: vi.fn().mockResolvedValue([]) } as never,
    {} as never,
    { run: vi.fn().mockResolvedValue({ status: 'ok' }) } as never,
  );
  const worker = new Worker(queueName, (job) => processor.process(job.name as any, job.data), {
    connection,
    concurrency: 2,
  });

  beforeAll(async () => {
    await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
  });

  afterAll(async () => {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('deduplicates deterministic job IDs', async () => {
    const data = { olderThanMinutes: 60, limit: 10, dryRun: false };
    const first = await queue.add('ai-reconcile', data, { jobId: 'same-window' });
    const second = await queue.add('ai-reconcile', data, { jobId: 'same-window' });
    expect(second.id).toBe(first.id);
    await first.waitUntilFinished(events, 10_000);
    expect(ai.reconcileStale).toHaveBeenCalledTimes(1);
  });

  it('processes independent jobs concurrently within the configured bound', async () => {
    let active = 0;
    let maxActive = 0;
    ai.reconcileStale.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      return { scanned: 1, errors: [] };
    });
    const data = { olderThanMinutes: 60, limit: 10, dryRun: false };
    const first = await queue.add('ai-reconcile', data, { jobId: `a-${randomUUID()}` });
    const second = await queue.add('ai-reconcile', data, { jobId: `b-${randomUUID()}` });
    await Promise.all([
      first.waitUntilFinished(events, 10_000),
      second.waitUntilFinished(events, 10_000),
    ]);
    expect(maxActive).toBe(2);
  });
});
