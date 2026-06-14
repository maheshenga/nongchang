import { vi } from 'vitest';

const store = new Map<string, unknown>();

const getStorageImpl = (k: string) => store.get(k) ?? '';
const setStorageImpl = (k: string, v: unknown) => void store.set(k, v);
const removeStorageImpl = (k: string) => void store.delete(k);

export const taroMock = {
  request: vi.fn(),
  login: vi.fn(),
  uploadFile: vi.fn(),
  redirectTo: vi.fn(),
  navigateTo: vi.fn(),
  switchTab: vi.fn(),
  showToast: vi.fn(),
  chooseImage: vi.fn(),
  scanCode: vi.fn(),
  getStorageSync: vi.fn(getStorageImpl),
  setStorageSync: vi.fn(setStorageImpl),
  removeStorageSync: vi.fn(removeStorageImpl),
  __reset() {
    store.clear();
    Object.values(this).forEach((f) => {
      if (typeof f === 'function' && 'mockReset' in f) (f as any).mockReset();
    });
    // mockReset() wipes implementations, so re-apply storage-backed behavior
    this.getStorageSync.mockImplementation(getStorageImpl);
    this.setStorageSync.mockImplementation(setStorageImpl);
    this.removeStorageSync.mockImplementation(removeStorageImpl);
  },
};

export default taroMock;
