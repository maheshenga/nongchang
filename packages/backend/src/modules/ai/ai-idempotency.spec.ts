import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { requireAiIdempotencyKey } from './ai-idempotency';

describe('AI idempotency key', () => {
  it('accepts conservative 16-128 character keys', () => {
    expect(requireAiIdempotencyKey('action_20260713-abc.def')).toBe('action_20260713-abc.def');
  });

  it.each([undefined, '', 'short', 'contains space here', 'x'.repeat(129)])(
    'rejects invalid key %s',
    (value) => expect(() => requireAiIdempotencyKey(value)).toThrow(BadRequestException),
  );
});
