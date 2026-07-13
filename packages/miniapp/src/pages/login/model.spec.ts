import { describe, expect, it } from 'vitest';
import { canStartLogin, normalizePasswordLogin } from './model';

describe('miniapp login state', () => {
  it('normalizes password login fields before submission', () => {
    expect(normalizePasswordLogin({
      tenantCode: ' acme ',
      username: ' admin ',
      password: ' secret ',
    })).toEqual({
      tenantCode: 'ACME',
      username: 'admin',
      password: 'secret',
    });
  });

  it('requires authorization and blocks both methods while either is running', () => {
    expect(canStartLogin({ passwordLoading: true, wechatLoading: false, authorized: true })).toBe(false);
    expect(canStartLogin({ passwordLoading: false, wechatLoading: true, authorized: true })).toBe(false);
    expect(canStartLogin({ passwordLoading: false, wechatLoading: false, authorized: false })).toBe(false);
    expect(canStartLogin({ passwordLoading: false, wechatLoading: false, authorized: true })).toBe(true);
  });
});
