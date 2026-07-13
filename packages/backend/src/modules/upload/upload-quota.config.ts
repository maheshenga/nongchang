import { MAX_UPLOAD_SIZE_BYTES } from './upload.model';

export const DEFAULT_UPLOAD_DAILY_BYTES_LIMIT = 104_857_600;
export const DEFAULT_UPLOAD_ACTIVE_BYTES_LIMIT = 5_368_709_120;
export const DEFAULT_UPLOAD_PENDING_MAX_AGE_MINUTES = 60;

export function readUploadQuotaLimits(env: NodeJS.ProcessEnv = process.env) {
  const dailyLimitBytes = readPositiveSafeInteger(
    env.UPLOAD_DAILY_BYTES_LIMIT,
    DEFAULT_UPLOAD_DAILY_BYTES_LIMIT,
    'UPLOAD_DAILY_BYTES_LIMIT',
  );
  const activeLimitBytes = readPositiveSafeInteger(
    env.UPLOAD_ACTIVE_BYTES_LIMIT,
    DEFAULT_UPLOAD_ACTIVE_BYTES_LIMIT,
    'UPLOAD_ACTIVE_BYTES_LIMIT',
  );
  if (activeLimitBytes < MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`UPLOAD_ACTIVE_BYTES_LIMIT must be at least ${MAX_UPLOAD_SIZE_BYTES}`);
  }
  return { dailyLimitBytes: BigInt(dailyLimitBytes), activeLimitBytes: BigInt(activeLimitBytes) };
}

export function readUploadPendingMaxAgeMinutes(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveSafeInteger(
    env.UPLOAD_PENDING_MAX_AGE_MINUTES,
    DEFAULT_UPLOAD_PENDING_MAX_AGE_MINUTES,
    'UPLOAD_PENDING_MAX_AGE_MINUTES',
  );
}

function readPositiveSafeInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
  return value;
}
