import type {
  WechatRegisterResponse,
  WechatRegistrationStatusResponse,
} from '@nongchang/shared';

export interface RegistrationStatusView {
  displayName: string;
  status: WechatRegistrationStatusResponse['status'];
  statusLabel: '待审核' | '已通过' | '未通过或已停用';
  applicationId: string;
  nextMessage: string;
}

export function buildRegistrationStatus(
  displayName: string,
  response: WechatRegisterResponse,
): RegistrationStatusView {
  if (response.status !== 'pending') throw new Error('Unexpected registration status');
  return {
    displayName,
    status: 'pending',
    statusLabel: '待审核',
    applicationId: response.applicationId,
    nextMessage: '请等待租户管理员或代理商管理员审核。',
  };
}

export function buildRegistrationStatusFromLookup(
  response: WechatRegistrationStatusResponse,
): RegistrationStatusView {
  if (response.status === 'approved') {
    return {
      displayName: response.displayName,
      status: response.status,
      statusLabel: '已通过',
      applicationId: response.applicationId,
      nextMessage: '审核已通过，请返回登录页使用微信登录。',
    };
  }
  if (response.status === 'rejected_or_suspended') {
    return {
      displayName: response.displayName,
      status: response.status,
      statusLabel: '未通过或已停用',
      applicationId: response.applicationId,
      nextMessage: '请联系平台管理员确认审核结果或账号状态。',
    };
  }
  return {
    displayName: response.displayName,
    status: response.status,
    statusLabel: '待审核',
    applicationId: response.applicationId,
    nextMessage: '请等待租户管理员或代理商管理员审核。',
  };
}
