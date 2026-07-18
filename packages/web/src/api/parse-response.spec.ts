import { uploadResponseSchema } from '@nongchang/shared';
import { describe, expect, it } from 'vitest';
import { parseResponse } from './parse-response';

describe('parseResponse', () => {
  it('returns valid data and labels invalid responses without echoing payloads', () => {
    expect(parseResponse(uploadResponseSchema, { url: 'https://example.com/a.jpg' }, 'uploads.create'))
      .toEqual({ url: 'https://example.com/a.jpg' });
    expect(() => parseResponse(uploadResponseSchema, { secret: 'do-not-echo' }, 'uploads.create'))
      .toThrowError(/^Invalid uploads\.create response$/);
  });
});
