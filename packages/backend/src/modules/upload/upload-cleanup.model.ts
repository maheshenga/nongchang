import { readUploadPendingMaxAgeMinutes } from './upload-quota.config';

export interface UploadCleanupOptions {
  olderThanMinutes: number;
  limit: number;
  execute: boolean;
}

export function parseUploadCleanupArgs(args: string[]): UploadCleanupOptions {
  const result: UploadCleanupOptions = {
    olderThanMinutes: readUploadPendingMaxAgeMinutes(),
    limit: 100,
    execute: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--execute') {
      result.execute = true;
      continue;
    }
    if (arg === '--older-than-minutes' || arg === '--limit') {
      const raw = args[index + 1];
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${arg} requires a positive integer`);
      if (arg === '--limit' && value > 1000) throw new Error('--limit must be at most 1000');
      if (arg === '--older-than-minutes') result.olderThanMinutes = value;
      else result.limit = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}
