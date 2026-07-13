import type { PendingResponse } from '@nongchang/shared';

export interface RegistrationStatusView {
  displayName: string;
  statusLabel: '待审核';
  applicationId: string | null;
  trackingMessage: string;
}

export function buildRegistrationStatus(displayName: string, response: PendingResponse): RegistrationStatusView {
  if (response.status !== 'pending') throw new Error('Unexpected registration status');
  return {
    displayName,
    statusLabel: '待审核',
    applicationId: null,
    trackingMessage: '当前接口未返回申请跟踪编号',
  };
}
