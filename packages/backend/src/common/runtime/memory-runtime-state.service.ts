import { Injectable } from '@nestjs/common';
import type { RuntimeStateStore } from './runtime-state.types';

interface Entry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class MemoryRuntimeStateService implements RuntimeStateStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  private read(key: string): Entry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async getJson<T>(key: string): Promise<T | null> {
    return (this.read(key)?.value as T | undefined) ?? null;
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const current = this.read(key);
    const value = typeof current?.value === 'number' ? current.value + 1 : 1;
    this.entries.set(key, {
      value,
      expiresAt: current?.expiresAt ?? this.now() + ttlMs,
    });
    return value;
  }

  async acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean> {
    if (this.read(key)) return false;
    this.entries.set(key, { value: owner, expiresAt: this.now() + ttlMs });
    return true;
  }

  async releaseLock(key: string, owner: string): Promise<boolean> {
    const current = this.read(key);
    if (current?.value !== owner) return false;
    this.entries.delete(key);
    return true;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}
