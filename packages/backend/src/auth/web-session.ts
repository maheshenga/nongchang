export const WEB_REFRESH_COOKIE = 'nc_refresh';
export const WEB_REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const WEB_REFRESH_COOKIE_PATH = '/api/auth/web';

function cookieSecuritySuffix(secure: boolean): string {
  return secure ? '; Secure' : '';
}

export function buildWebRefreshCookie(token: string, secure: boolean): string {
  return `${WEB_REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=${WEB_REFRESH_COOKIE_PATH}; HttpOnly${cookieSecuritySuffix(secure)}; SameSite=Strict; Max-Age=${WEB_REFRESH_MAX_AGE_SECONDS}`;
}

export function buildExpiredWebRefreshCookie(secure: boolean): string {
  return `${WEB_REFRESH_COOKIE}=; Path=${WEB_REFRESH_COOKIE_PATH}; HttpOnly${cookieSecuritySuffix(secure)}; SameSite=Strict; Max-Age=0`;
}

export function parseWebRefreshCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== WEB_REFRESH_COOKIE) continue;

    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return value || null;
    } catch {
      return null;
    }
  }

  return null;
}
