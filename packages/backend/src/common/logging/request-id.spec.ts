import { describe, expect, it } from 'vitest';
import { requestIdFromHeader } from './request-id';

describe('requestIdFromHeader', () => {
  it.each(['abc', 'web.1:trace-2', 'A_B-C.123'])('accepts a safe client request ID: %s', (value) => {
    expect(requestIdFromHeader(value)).toBe(value);
  });

  it.each([
    '',
    'contains space',
    'contains/slash',
    'x'.repeat(65),
    ['array-value'],
    undefined,
  ])('generates a UUID for unsafe input: %j', (value) => {
    const requestId = requestIdFromHeader(value);
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(requestId).not.toBe(value);
  });
});
