export type IntegrationDraft = {
  provider: 'wechat' | 'xfyun' | 'tianditu';
  appId: string;
  enabled: boolean;
  secretChanged: boolean;
};

export function isIntegrationDirty(baseline: IntegrationDraft, current: IntegrationDraft): boolean {
  return baseline.provider !== current.provider
    || baseline.appId.trim() !== current.appId.trim()
    || baseline.enabled !== current.enabled
    || current.secretChanged;
}

export function validateIntegrationDraft(draft: IntegrationDraft, hasStoredSecret: boolean): string[] {
  const errors: string[] = [];
  const identifierLabel = draft.provider === 'wechat'
    ? '微信 AppID'
    : draft.provider === 'xfyun'
      ? '讯飞 APPID'
      : '天地图 key';

  if (!draft.appId.trim()) errors.push(`${identifierLabel} 不能为空`);
  if (draft.enabled && draft.provider === 'wechat' && !hasStoredSecret && !draft.secretChanged) {
    errors.push('首次启用微信登录时必须填写 AppSecret');
  }
  if (draft.enabled && draft.provider === 'xfyun' && !hasStoredSecret && !draft.secretChanged) {
    errors.push('首次启用讯飞语音转写时必须填写 APIKey 和 APISecret');
  }
  return errors;
}
