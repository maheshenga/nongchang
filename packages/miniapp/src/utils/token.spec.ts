import { describe, it, expect } from 'vitest';
import { decodeToken, roleLabel } from './token';

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
});
