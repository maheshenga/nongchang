import { describe, it, expect } from 'vitest';
import { decodeToken, roleLabel, isTokenExpired } from './token';

// 构造一个 JWT（header.payload.signature），payload 用 base64url
function makeToken(payload: object): string {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${b64}.sig`;
}

describe('utils/token', () => {
  it('decodes JWT payload', () => {
    const t = makeToken({ username: 'merchantA', role: 'merchant', tenantId: 't1' });
    const p = decodeToken(t);
    expect(p?.username).toBe('merchantA');
    expect(p?.role).toBe('merchant');
  });

  it('decodes payload with non-ascii', () => {
    const t = makeToken({ username: '大理基地' });
    expect(decodeToken(t)?.username).toBe('大理基地');
  });

  it('returns null for malformed token', () => {
    expect(decodeToken('garbage')).toBeNull();
  });

  it('roleLabel maps known + fallback', () => {
    expect(roleLabel('merchant')).toBe('商家主理人');
    expect(roleLabel('unknown')).toBe('农技员');
    expect(roleLabel(undefined)).toBe('农技员');
  });

  it('isTokenExpired:已过期 exp 返回 true', () => {
    const t = makeToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(isTokenExpired(t)).toBe(true);
  });

  it('isTokenExpired:未过期 exp 返回 false', () => {
    const t = makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isTokenExpired(t)).toBe(false);
  });

  it('isTokenExpired:无 exp 或无法解析时返回 false(交后端判定)', () => {
    expect(isTokenExpired(makeToken({ username: 'x' }))).toBe(false);
    expect(isTokenExpired('garbage')).toBe(false);
  });
});
