import { describe, expect, it } from 'vitest';
import {
  buildExpiredWebRefreshCookie,
  buildWebRefreshCookie,
  parseWebRefreshCookie,
} from './web-session';

describe('web refresh-session cookies', () => {
  it('creates the production-only secure HttpOnly cookie contract', () => {
    expect(buildWebRefreshCookie('a.b.c', true)).toBe(
      'nc_refresh=a.b.c; Path=/api/auth/web; HttpOnly; Secure; SameSite=Strict; Max-Age=604800',
    );
    expect(buildWebRefreshCookie('a.b.c', false)).toBe(
      'nc_refresh=a.b.c; Path=/api/auth/web; HttpOnly; SameSite=Strict; Max-Age=604800',
    );
  });

  it('expires the same scoped cookie on logout', () => {
    expect(buildExpiredWebRefreshCookie(true)).toBe(
      'nc_refresh=; Path=/api/auth/web; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    );
  });

  it('reads only a well-formed named refresh cookie', () => {
    expect(parseWebRefreshCookie('theme=dark; malformed=%; nc_refresh=a.b.c; locale=zh-CN')).toBe('a.b.c');
    expect(parseWebRefreshCookie('theme=dark; nc_refresh=%')).toBeNull();
    expect(parseWebRefreshCookie('theme=dark')).toBeNull();
    expect(parseWebRefreshCookie(undefined)).toBeNull();
  });
});
