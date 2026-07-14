import { describe, expect, it } from 'vitest';
import { buildCloseInput, canSelfClose } from './model';

describe('account closure model', () => {
  it('allows only self-service account roles', () => {
    expect(canSelfClose('merchant')).toBe(true);
    expect(canSelfClose('member')).toBe(true);
    expect(canSelfClose('system_admin')).toBe(false);
    expect(canSelfClose('agent_admin')).toBe(false);
  });

  it('builds exact password and WeChat proof contracts', () => {
    expect(buildCloseInput('password', {
      password: 'password123', appId: '', code: '',
    })).toEqual({
      method: 'password', currentPassword: 'password123', confirmation: '注销账号',
    });
    expect(buildCloseInput('wechat', {
      password: '', appId: 'wx-example', code: 'fresh-code',
    })).toEqual({
      method: 'wechat', appId: 'wx-example', code: 'fresh-code', confirmation: '注销账号',
    });
  });
});
