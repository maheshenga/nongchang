const LEGACY_TOKEN_KEYS = ['nc_access_token', 'nc_refresh_token'];

function removeLegacyPersistedTokens(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

removeLegacyPersistedTokens();

let accessToken: string | null = null;
let accessTokenGeneration = 0;

export function getAccessToken(): string | null {
  return accessToken;
}

export function getAccessTokenGeneration(): number {
  return accessTokenGeneration;
}

export function setAccessToken(next: string): void {
  accessToken = next;
  accessTokenGeneration += 1;
}

export function setAccessTokenIfCurrent(next: string, expectedGeneration: number): boolean {
  if (accessTokenGeneration !== expectedGeneration) return false;
  accessToken = next;
  accessTokenGeneration += 1;
  return true;
}

export function clearAccessToken(): void {
  accessToken = null;
  accessTokenGeneration += 1;
}
