import { describe, expect, it } from 'vitest';
import { resolveApiProxyTarget } from './vite.config';

describe('Vite API proxy target', () => {
  it('defaults to the IPv4 backend development address', () => {
    expect(resolveApiProxyTarget({})).toBe('http://127.0.0.1:3001');
  });

  it('uses the browser-test backend target when supplied', () => {
    expect(resolveApiProxyTarget({ WEB_API_PROXY_TARGET: ' http://127.0.0.1:3101 ' }))
      .toBe('http://127.0.0.1:3101');
  });
});
