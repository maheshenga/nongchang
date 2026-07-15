import { describe, expect, it } from 'vitest';
import { readListenHost } from './listen-host';

describe('readListenHost', () => {
  it('defaults every runtime to the IPv4 loopback address', () => {
    expect(readListenHost({})).toBe('127.0.0.1');
  });

  it('accepts an explicitly configured loopback address', () => {
    expect(readListenHost({ HOST: ' 127.0.0.1 ' })).toBe('127.0.0.1');
  });

  it.each(['0.0.0.0', '::', 'localhost', '192.168.1.20', 'farm.qingyouai.com'])(
    'rejects non-loopback HOST=%s',
    (host) => {
      expect(() => readListenHost({ HOST: host })).toThrow(/HOST.*127\.0\.0\.1/);
    },
  );
});
