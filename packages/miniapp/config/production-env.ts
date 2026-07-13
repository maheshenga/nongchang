const WX_APP_ID = /^wx[0-9A-Za-z]{16}$/;

export function resolveProductionMiniappEnv(
  env: NodeJS.ProcessEnv,
): { apiUrl: string; wxAppId: string; supportContact: string } {
  const rawApi = env.TARO_APP_API?.trim();
  if (!rawApi) throw new Error('TARO_APP_API is required for a production miniapp build');

  let url: URL;
  try {
    url = new URL(rawApi);
  } catch {
    throw new Error('TARO_APP_API must be a valid URL');
  }

  if (url.protocol !== 'https:') throw new Error('TARO_APP_API must use HTTPS');
  if (url.hostname.toUpperCase().includes('REPLACE_ME')) {
    throw new Error('TARO_APP_API contains a placeholder hostname');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api')) throw new Error('TARO_APP_API pathname must end with /api');

  const wxAppId = env.TARO_APP_WX_APPID?.trim() ?? '';
  if (!WX_APP_ID.test(wxAppId)) {
    throw new Error('TARO_APP_WX_APPID must be a valid WeChat AppID');
  }

  return {
    apiUrl: `${url.origin}${pathname}`,
    wxAppId,
    supportContact: env.TARO_APP_SUPPORT_CONTACT?.trim() ?? '',
  };
}
