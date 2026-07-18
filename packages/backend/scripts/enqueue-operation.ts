import { Queue, type ConnectionOptions } from 'bullmq';
import { OPERATIONS_JOB_NAMES, OPERATIONS_QUEUE, type OperationsJobName } from '../src/modules/operations/operations.constants';
import { readRedisUrl } from '../src/common/runtime/runtime-state.types';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(readArg(name) ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 1_000) {
    throw new Error(`${name} must be an integer between 1 and 1000`);
  }
  return value;
}

async function main() {
  const job = readArg('job') as OperationsJobName | undefined;
  if (!job || !OPERATIONS_JOB_NAMES.includes(job)) {
    throw new Error(`job must be one of: ${OPERATIONS_JOB_NAMES.join(', ')}`);
  }
  const redisUrl = new URL(readRedisUrl());
  const connection: ConnectionOptions = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue(OPERATIONS_QUEUE, { connection });
  try {
    const olderThanMinutes = positiveInteger('older-than-minutes', 60);
    const limit = positiveInteger('limit', 100);
    const id = readArg('job-id') ?? `manual:${job}:${Date.now()}`;
    const created = await queue.add(job, {
      olderThanMinutes,
      limit,
      dryRun: process.argv.includes('--dry-run'),
    }, {
      jobId: id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    process.stdout.write(`${JSON.stringify({ queue: OPERATIONS_QUEUE, job, id: created.id })}\n`);
  } finally {
    await queue.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Failed to enqueue operation'}\n`);
  process.exitCode = 1;
});
