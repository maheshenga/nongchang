export const OPERATIONS_QUEUE = 'platform-operations';

export const OPERATIONS_JOB_NAMES = [
  'ai-reconcile',
  'upload-cleanup',
  'operational-audit',
] as const;

export type OperationsJobName = typeof OPERATIONS_JOB_NAMES[number];

export interface OperationsJobPayload {
  cutoffIso?: string;
  olderThanMinutes?: number;
  limit: number;
  dryRun: boolean;
}

export function readOperationsWorkerConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OPERATIONS_WORKER_CONCURRENCY?.trim() || '2';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 32) {
    throw new Error('[启动校验] OPERATIONS_WORKER_CONCURRENCY 必须是 1 到 32 的整数');
  }
  return value;
}
