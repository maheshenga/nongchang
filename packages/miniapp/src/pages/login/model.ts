import type { PublicLegalQuery } from '@nongchang/shared';

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
  publicationId: string | null;
  legalLoading: boolean;
  legalError: string | null;
  method: 'password' | 'wechat';
  tenantCode: string;
  legalLookupCode: string | null;
}

export function legalLookupTenantCode(lookup: PublicLegalQuery): string | null {
  return lookup.tenantCode?.trim().toUpperCase() || null;
}

export function canStartLogin(state: LoginAvailability): boolean {
  if (
    !state.authorized
    || !state.publicationId
    || state.legalLoading
    || state.legalError
    || state.passwordLoading
    || state.wechatLoading
  ) {
    return false;
  }
  if (state.method === 'password') {
    return state.legalLookupCode === state.tenantCode.trim().toUpperCase();
  }
  return true;
}
