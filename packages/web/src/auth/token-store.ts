let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(next: string): void {
  accessToken = next;
}

export function clearAccessToken(): void {
  accessToken = null;
}
