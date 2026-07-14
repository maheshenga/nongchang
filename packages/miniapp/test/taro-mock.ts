import { vi } from 'vitest';

const store = new Map<string, unknown>();

const getStorageImpl = (k: string) => store.get(k) ?? '';
const setStorageImpl = (k: string, v: unknown) => void store.set(k, v);
const removeStorageImpl = (k: string) => void store.delete(k);
const fileSystemManager = { readFileSync: vi.fn() };

export const taroMock = {
  request: vi.fn(),
  login: vi.fn(),
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  saveFile: vi.fn(),
  shareFileMessage: vi.fn(),
  getFileSystemManager: vi.fn(() => fileSystemManager),
  env: { USER_DATA_PATH: '/user-data' },
  redirectTo: vi.fn(),
  navigateTo: vi.fn(),
  switchTab: vi.fn(),
  navigateBack: vi.fn(),
  showToast: vi.fn(),
  showModal: vi.fn(),
  chooseImage: vi.fn(),
  scanCode: vi.fn(),
  getLocation: vi.fn(),
  getNetworkType: vi.fn(),
  onNetworkStatusChange: vi.fn(),
  offNetworkStatusChange: vi.fn(),
  pageScrollTo: vi.fn(),
  enableAlertBeforeUnload: vi.fn(),
  disableAlertBeforeUnload: vi.fn(),
  getRecorderManager: vi.fn(() => ({
    onStart: vi.fn(),
    onStop: vi.fn(),
    onError: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  getStorageSync: vi.fn(getStorageImpl),
  setStorageSync: vi.fn(setStorageImpl),
  removeStorageSync: vi.fn(removeStorageImpl),
  __reset() {
    store.clear();
    fileSystemManager.readFileSync.mockReset();
    Object.values(this).forEach((f) => {
      if (typeof f === 'function' && 'mockReset' in f) (f as any).mockReset();
    });
    // mockReset() wipes implementations, so re-apply storage-backed behavior
    this.getStorageSync.mockImplementation(getStorageImpl);
    this.setStorageSync.mockImplementation(setStorageImpl);
    this.removeStorageSync.mockImplementation(removeStorageImpl);
    this.getFileSystemManager.mockReturnValue(fileSystemManager);
  },
};

export default taroMock;
