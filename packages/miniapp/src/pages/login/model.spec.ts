import { describe, expect, it } from 'vitest';
import { canStartLogin, legalLookupTenantCode, normalizePasswordLogin } from './model';

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

  it('fails closed until a current publication is loaded and authorized', () => {
    const ready = {
      passwordLoading: false,
      wechatLoading: false,
      authorized: true,
      publicationId: '22222222-2222-4222-8222-222222222222',
      legalLoading: false,
      legalError: null,
      method: 'wechat' as const,
      tenantCode: '',
      legalLookupCode: null,
    };

    expect(canStartLogin({ ...ready, passwordLoading: true })).toBe(false);
    expect(canStartLogin({ ...ready, wechatLoading: true })).toBe(false);
    expect(canStartLogin({ ...ready, authorized: false })).toBe(false);
    expect(canStartLogin({ ...ready, publicationId: null })).toBe(false);
    expect(canStartLogin({ ...ready, legalLoading: true })).toBe(false);
    expect(canStartLogin({ ...ready, legalError: '协议加载失败' })).toBe(false);
    expect(canStartLogin(ready)).toBe(true);
  });

  it('recovers the normalized institution code from a retry lookup', () => {
    expect(legalLookupTenantCode({ tenantCode: ' demo ', appId: 'wx-example' })).toBe('DEMO');
    expect(legalLookupTenantCode({ appId: 'wx-example' })).toBeNull();
  });

  it('requires password login legal lookup to match the normalized institution code', () => {
    const passwordReady = {
      passwordLoading: false,
      wechatLoading: false,
      authorized: true,
      publicationId: '22222222-2222-4222-8222-222222222222',
      legalLoading: false,
      legalError: null,
      method: 'password' as const,
      tenantCode: ' demo ',
      legalLookupCode: 'DEMO',
    };

    expect(canStartLogin(passwordReady)).toBe(true);
    expect(canStartLogin({ ...passwordReady, legalLookupCode: 'OTHER' })).toBe(false);
    expect(canStartLogin({ ...passwordReady, legalLookupCode: null })).toBe(false);
  });
});
