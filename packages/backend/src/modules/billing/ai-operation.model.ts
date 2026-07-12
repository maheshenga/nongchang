export type AiOperationState =
  | 'RESERVED'
  | 'IN_FLIGHT'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CONFIRMED'
  | 'RELEASED'
  | 'REVIEW_REQUIRED';

export type AiOperationRecoveryAction = 'release' | 'confirm' | 'review' | 'skip';

export function recoveryActionForAiOperation(
  status: AiOperationState,
): AiOperationRecoveryAction {
  switch (status) {
    case 'RESERVED':
    case 'FAILED':
      return 'release';
    case 'SUCCEEDED':
      return 'confirm';
    case 'IN_FLIGHT':
    case 'REVIEW_REQUIRED':
      return 'review';
    case 'CONFIRMED':
    case 'RELEASED':
      return 'skip';
  }
}

export function toAiOperationErrorCategory(error: unknown): string {
  return error instanceof Error && error.name === 'AbortError'
    ? 'provider_timeout'
    : 'provider_error';
}
