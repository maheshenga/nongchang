export interface PasswordLoginDraft {
  tenantCode: string;
  username: string;
  password: string;
}

export function normalizePasswordLogin(draft: PasswordLoginDraft): PasswordLoginDraft {
  return {
    tenantCode: draft.tenantCode.trim().toUpperCase(),
    username: draft.username.trim(),
    password: draft.password.trim(),
  };
}

export interface LoginAvailability {
  passwordLoading: boolean;
  wechatLoading: boolean;
  authorized: boolean;
}

export function canStartLogin(state: LoginAvailability): boolean {
  return state.authorized && !state.passwordLoading && !state.wechatLoading;
}
