// Node >=22 ships a native experimental Web Storage `localStorage` global that
// is non-functional without `--localstorage-file`. Because vitest's jsdom env
// has `window === globalThis`, this broken native global shadows jsdom's own
// Storage, so neither `localStorage` nor `window.localStorage` works. Install a
// minimal, working in-memory Storage so token-store tests behave like a browser.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
});
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: storage,
});
