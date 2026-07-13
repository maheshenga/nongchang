import { useEffect } from 'react';
import { vi } from 'vitest';

const storage = new globalThis.Map<string, unknown>();
let routerParams: Record<string, string> = {};

export const request = vi.fn();
export const login = vi.fn();
export const uploadFile = vi.fn();
export const redirectTo = vi.fn();
export const navigateTo = vi.fn();
export const switchTab = vi.fn();
export const navigateBack = vi.fn();
export const showToast = vi.fn();
export const showModal = vi.fn();
export const chooseImage = vi.fn();
export const scanCode = vi.fn();
export const getLocation = vi.fn();
export const setClipboardData = vi.fn();
export const pageScrollTo = vi.fn();
export const enableAlertBeforeUnload = vi.fn();
export const disableAlertBeforeUnload = vi.fn();
export const canvasToTempFilePath = vi.fn();
export const saveImageToPhotosAlbum = vi.fn();
export const onNetworkStatusChange = vi.fn();
export const offNetworkStatusChange = vi.fn();
export const getNetworkType = vi.fn(async () => ({ networkType: 'wifi' }));
export const getRecorderManager = vi.fn(() => ({
  onStart: vi.fn(),
  onStop: vi.fn(),
  onError: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));
export const createCanvasContext = vi.fn(() => ({
  setFillStyle: vi.fn(),
  fillRect: vi.fn(),
  setFontSize: vi.fn(),
  fillText: vi.fn(),
  draw: vi.fn((_reserve?: boolean, callback?: () => void) => callback?.()),
}));
export const getStorageSync = vi.fn((key: string) => storage.get(key) ?? '');
export const setStorageSync = vi.fn((key: string, value: unknown) => void storage.set(key, value));
export const removeStorageSync = vi.fn((key: string) => void storage.delete(key));

export function useDidShow(callback: () => void): void {
  useEffect(() => {
    callback();
  }, []);
}

export function useRouter(): { params: Record<string, string> } {
  return { params: routerParams };
}

export function __setRouterParams(params: Record<string, string>): void {
  routerParams = params;
}

export function __resetTaro(): void {
  storage.clear();
  routerParams = {};
  Object.values(taro).forEach((value) => {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as ReturnType<typeof vi.fn>).mockClear();
    }
  });
}

const taro = {
  request,
  login,
  uploadFile,
  redirectTo,
  navigateTo,
  switchTab,
  navigateBack,
  showToast,
  showModal,
  chooseImage,
  scanCode,
  getLocation,
  setClipboardData,
  pageScrollTo,
  enableAlertBeforeUnload,
  disableAlertBeforeUnload,
  canvasToTempFilePath,
  saveImageToPhotosAlbum,
  onNetworkStatusChange,
  offNetworkStatusChange,
  getNetworkType,
  getRecorderManager,
  createCanvasContext,
  getStorageSync,
  setStorageSync,
  removeStorageSync,
};

export default taro;
