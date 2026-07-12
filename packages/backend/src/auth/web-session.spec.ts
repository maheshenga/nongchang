import { describe, expect, it } from 'vitest';
import {
  buildExpiredWebRefreshCookie,
  buildWebRefreshCookie,
  parseWebRefreshCookie,
} from './web-session';

describe('web refresh cookie', () => {
  it('uses an HttpOnly strict same-origin cookie for seven days', () => {
    expect(buildWebRefreshCookie('a.b.c', true)).toContain(
      'nc_refresh=a.b.c; Path=/api/auth/web; HttpOnly; Secure; SameSite=Strict; Max-Age=604800',
    );
  });

  it('only includes Secure in production mode', () => {
    expect(buildWebRefreshCookie('a.b.c', false)).not.toContain('; Secure');
    expect(buildWebRefreshCookie('a.b.c', true)).toContain('; Secure');
  });

  it('expires the refresh cookie with the same scope', () => {
    expect(buildExpiredWebRefreshCookie(true)).toContain(
      'nc_refresh=; Path=/api/auth/web; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    );
  });

  it('parses the named cookie while ignoring malformed unrelated cookies', () => {
    expect(parseWebRefreshCookie('bad=%E0%A4%A; nc_refresh=refresh%2Etoken; theme=dark')).toBe(
      'refresh.token',
    );
  });

  it('returns null when the named cookie is absent or malformed', () => {
    expect(parseWebRefreshCookie(undefined)).toBeNull();
    expect(parseWebRefreshCookie('theme=dark')).toBeNull();
    expect(parseWebRefreshCookie('nc_refresh=%E0%A4%A')).toBeNull();
  });
});
