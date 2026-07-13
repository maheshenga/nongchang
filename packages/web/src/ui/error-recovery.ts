export const CHUNK_RELOAD_MARKER = 'nongchang:chunk-reload:v1';

function errorName(error: unknown): string {
  return error instanceof Error
    ? error.name
    : typeof error === 'object' && error && 'name' in error
      ? String(error.name)
      : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error ?? '');
}

export function isLazyChunkLoadError(error: unknown): boolean {
  const text = `${errorName(error)} ${errorMessage(error)}`;
  return /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
}

export function isSessionExpiredError(error: unknown): boolean {
  if (typeof error === 'object' && error) {
    const candidate = error as { status?: unknown; response?: { status?: unknown } };
    if (candidate.status === 401 || candidate.response?.status === 401) return true;
  }
  return /session expired|会话.*过期|登录状态.*失效|请重新登录/i.test(errorMessage(error));
}

export function attemptChunkReload(
  error: unknown,
  storage: Storage,
  reload: () => void,
): boolean {
  if (!isLazyChunkLoadError(error)) return false;

  try {
    if (storage.getItem(CHUNK_RELOAD_MARKER)) return false;
    storage.setItem(CHUNK_RELOAD_MARKER, '1');
    reload();
    return true;
  } catch {
    return false;
  }
}
