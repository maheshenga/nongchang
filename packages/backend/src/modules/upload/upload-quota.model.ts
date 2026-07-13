export type UploadQuotaScope = 'daily' | 'active';
export type UploadAssetState = 'PENDING' | 'ACTIVE' | 'FAILED' | 'DELETED';

export class UploadQuotaExceededError extends Error {
  constructor(
    public readonly scope: UploadQuotaScope,
    public readonly limitBytes: bigint,
    public readonly usedBytes: bigint,
  ) {
    super(`Upload ${scope} quota exceeded`);
    this.name = 'UploadQuotaExceededError';
  }
}

interface ReservationInput {
  usageDayKey: string;
  currentDayKey: string;
  dailyBytes: bigint;
  activeBytes: bigint;
  sizeBytes: bigint;
  dailyLimitBytes: bigint;
  activeLimitBytes: bigint;
}

export function applyUploadReservation(input: ReservationInput) {
  const dailyBytes = input.usageDayKey === input.currentDayKey ? input.dailyBytes : 0n;
  if (dailyBytes + input.sizeBytes > input.dailyLimitBytes) {
    throw new UploadQuotaExceededError('daily', input.dailyLimitBytes, dailyBytes);
  }
  if (input.activeBytes + input.sizeBytes > input.activeLimitBytes) {
    throw new UploadQuotaExceededError('active', input.activeLimitBytes, input.activeBytes);
  }
  return {
    dayKey: input.currentDayKey,
    dailyBytes: dailyBytes + input.sizeBytes,
    activeBytes: input.activeBytes + input.sizeBytes,
  };
}

interface ReleaseInput {
  assetStatus: UploadAssetState;
  assetDayKey: string;
  usageDayKey: string;
  dailyBytes: bigint;
  activeBytes: bigint;
  sizeBytes: bigint;
}

export function applyUploadRelease(input: ReleaseInput) {
  if (input.assetStatus === 'FAILED' || input.assetStatus === 'DELETED') {
    return { changed: false, dailyBytes: input.dailyBytes, activeBytes: input.activeBytes };
  }
  const releaseDaily = input.assetStatus === 'PENDING' && input.assetDayKey === input.usageDayKey;
  return {
    changed: true,
    dailyBytes: releaseDaily ? subtractFloorZero(input.dailyBytes, input.sizeBytes) : input.dailyBytes,
    activeBytes: subtractFloorZero(input.activeBytes, input.sizeBytes),
  };
}

export function utcDayKey(value: Date = new Date()): string {
  return value.toISOString().slice(0, 10);
}

function subtractFloorZero(value: bigint, amount: bigint): bigint {
  return value > amount ? value - amount : 0n;
}
