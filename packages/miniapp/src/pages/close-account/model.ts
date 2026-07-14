import type { CloseAccountInput } from '@nongchang/shared';

export function canSelfClose(role: string | null | undefined): boolean {
  return role === 'merchant' || role === 'member';
}

export function buildCloseInput(
  method: 'password' | 'wechat',
  proof: { password: string; appId: string; code: string },
): CloseAccountInput {
  if (method === 'password') {
    return {
      method: 'password',
      currentPassword: proof.password,
      confirmation: '注销账号',
    };
  }
  return {
    method: 'wechat',
    appId: proof.appId,
    code: proof.code,
    confirmation: '注销账号',
  };
}
