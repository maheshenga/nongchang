import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_MARKER,
  attemptChunkReload,
  isLazyChunkLoadError,
  isSessionExpiredError,
} from './error-recovery';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('application error recovery', () => {
  it('recognizes common lazy chunk loading failures', () => {
    expect(isLazyChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isLazyChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true);
    expect(isLazyChunkLoadError(new Error('普通业务错误'))).toBe(false);
  });

  it('automatically reloads a failed chunk only once per session', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const error = new Error('ChunkLoadError: Loading chunk 9 failed');

    expect(attemptChunkReload(error, storage, reload)).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_MARKER)).toBe('1');
    expect(reload).toHaveBeenCalledTimes(1);

    expect(attemptChunkReload(error, storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('falls back to manual recovery when session storage is unavailable', () => {
    const reload = vi.fn();
    const deniedStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage;

    expect(attemptChunkReload(new Error('Loading chunk 3 failed'), deniedStorage, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('identifies session-expired failures without treating every error as authentication loss', () => {
    expect(isSessionExpiredError({ status: 401 })).toBe(true);
    expect(isSessionExpiredError(new Error('会话已过期，请重新登录'))).toBe(true);
    expect(isSessionExpiredError(new Error('请求超时'))).toBe(false);
  });
});
