export const WEB_REFRESH_COOKIE = 'nc_refresh';
export const WEB_REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const WEB_REFRESH_COOKIE_PATH = '/api/auth/web';

function formatWebRefreshCookie(value: string, secure: boolean, maxAge: number): string {
  const attributes = [
    `${WEB_REFRESH_COOKIE}=${value}`,
    `Path=${WEB_REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  return attributes.join('; ');
}

export function buildWebRefreshCookie(token: string, secure: boolean): string {
  return formatWebRefreshCookie(encodeURIComponent(token), secure, WEB_REFRESH_MAX_AGE_SECONDS);
}

export function buildExpiredWebRefreshCookie(secure: boolean): string {
  return formatWebRefreshCookie('', secure, 0);
}

export function parseWebRefreshCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== WEB_REFRESH_COOKIE) continue;

    const value = part.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }

  return null;
}
