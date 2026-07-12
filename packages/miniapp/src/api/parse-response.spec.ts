import { okResponseSchema } from '@nongchang/shared';
import { describe, expect, it } from 'vitest';
import { parseResponse } from './parse-response';

describe('parseResponse', () => {
  it('returns valid data and uses a safe labelled error', () => {
    expect(parseResponse(okResponseSchema, { ok: true }, 'auth.changePassword')).toEqual({ ok: true });
    expect(() => parseResponse(okResponseSchema, { token: 'secret' }, 'auth.changePassword'))
      .toThrowError(/^Invalid auth\.changePassword response$/);
  });
});
