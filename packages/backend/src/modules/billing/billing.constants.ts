import type { CreditResource } from '@nongchang/shared';

// 平台账户的固定 ownerId(全局唯一一个平台账户)。
export const PLATFORM_OWNER_ID = 'PLATFORM';

// AI 各能力单次调用扣减权重。
export const AI_WEIGHT = {
  chat: 1,
  diagnose: 3,
  transcribe: 2,
} as const;

export type AiKind = keyof typeof AI_WEIGHT;

// 余额字段名映射:资源 → CreditAccount 列。
export const BALANCE_FIELD: Record<CreditResource, 'aiBalance' | 'codeBalance'> = {
  AI: 'aiBalance',
  CODE: 'codeBalance',
};
