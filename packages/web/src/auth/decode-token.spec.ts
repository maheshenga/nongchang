import { describe, it, expect } from 'vitest';
import { decodeToken } from './decode-token';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('decodeToken', () => {
  it('extracts AuthUser fields from a valid token', () => {
    const token = makeJwt({
      userId: 'u1', tenantId: 't1', role: 'merchant',
      agentId: 'ag1', ownerId: 'u1',
    });
    expect(decodeToken(token)).toEqual({
      userId: 'u1', tenantId: 't1', role: 'merchant',
      agentId: 'ag1', ownerId: 'u1',
    });
  });

  it('returns null for a malformed token (not 3 segments)', () => {
    expect(decodeToken('not-a-jwt')).toBeNull();
  });

  it('returns null when payload is not valid JSON', () => {
    expect(decodeToken('aaa.!!!notbase64json!!!.ccc')).toBeNull();
  });

  it('handles agentId/ownerId being null', () => {
    const token = makeJwt({
      userId: 'u2', tenantId: 't1', role: 'system_admin',
      agentId: null, ownerId: null,
    });
    expect(decodeToken(token)).toEqual({
      userId: 'u2', tenantId: 't1', role: 'system_admin',
      agentId: null, ownerId: null,
    });
  });
});
