import { describe, expect, it } from 'vitest';
import { recoveryActionForAiOperation, toAiOperationErrorCategory } from './ai-operation.model';

describe('recoveryActionForAiOperation', () => {
  it.each([
    ['RESERVED', 'release'],
    ['FAILED', 'release'],
    ['SUCCEEDED', 'confirm'],
    ['IN_FLIGHT', 'review'],
    ['REVIEW_REQUIRED', 'review'],
    ['CONFIRMED', 'skip'],
    ['RELEASED', 'skip'],
  ] as const)('maps %s to %s', (status, action) => {
    expect(recoveryActionForAiOperation(status)).toBe(action);
  });
});

describe('toAiOperationErrorCategory', () => {
  it('stores only a stable category', () => {
    expect(toAiOperationErrorCategory(new Error('Bearer secret-token failed'))).toBe('provider_error');
  });

  it('distinguishes timeouts without persisting their message', () => {
    const error = new Error('provider credentials in timeout message');
    error.name = 'AbortError';
    expect(toAiOperationErrorCategory(error)).toBe('provider_timeout');
  });
});
