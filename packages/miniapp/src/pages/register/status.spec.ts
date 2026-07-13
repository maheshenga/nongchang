import { describe, expect, it } from 'vitest';
import { buildRegistrationStatus, buildRegistrationStatusFromLookup } from './status';

describe('registration application status', () => {
  it('builds a truthful pending view with the returned application identifier', () => {
    expect(buildRegistrationStatus('大理合作社', {
      applicationId: 'application-1',
      status: 'pending',
    })).toEqual({
      displayName: '大理合作社',
      status: 'pending',
      statusLabel: '待审核',
      applicationId: 'application-1',
      nextMessage: '请等待租户管理员或代理商管理员审核。',
    });
  });

  it('builds an approved view from a secure status lookup', () => {
    expect(buildRegistrationStatusFromLookup({
      applicationId: 'application-1',
      displayName: '大理合作社',
      status: 'approved',
      updatedAt: null,
    })).toEqual({
      displayName: '大理合作社',
      status: 'approved',
      statusLabel: '已通过',
      applicationId: 'application-1',
      nextMessage: '审核已通过，请返回登录页使用微信登录。',
    });
  });
});
