import { describe, expect, it } from 'vitest';
import { buildRegistrationStatus } from './status';

describe('registration application status', () => {
  it('builds a truthful pending view without fabricating a tracking number', () => {
    expect(buildRegistrationStatus('大理合作社', { status: 'pending' })).toEqual({
      displayName: '大理合作社',
      statusLabel: '待审核',
      applicationId: null,
      trackingMessage: '当前接口未返回申请跟踪编号',
    });
  });
});
