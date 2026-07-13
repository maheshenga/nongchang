import { describe, expect, it } from 'vitest';
import { parseTrustProxyHops } from './trusted-proxy';

describe('parseTrustProxyHops', () => {
  it('accepts an integer from zero through five', () => {
    expect(parseTrustProxyHops({ TRUST_PROXY_HOPS: '0' })).toBe(0);
    expect(parseTrustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(parseTrustProxyHops({})).toBe(1);
  });

  it.each(['-1', '1.5', '6', 'abc', ''])('rejects unsafe value %s', (value) => {
    expect(() => parseTrustProxyHops({ TRUST_PROXY_HOPS: value })).toThrow('TRUST_PROXY_HOPS');
  });
});
