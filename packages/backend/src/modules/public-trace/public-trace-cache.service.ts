import { Inject, Injectable, Optional } from '@nestjs/common';
import { PUBLIC_TRACE_CACHE_TTL_MS } from '@nongchang/shared';
import { MemoryRuntimeStateService } from '../../common/runtime/memory-runtime-state.service';
import { RUNTIME_STATE, type RuntimeStateStore } from '../../common/runtime/runtime-state.types';
import type { PublicTraceOpenResult } from './public-trace.model';

const VERSION_TTL_MS = 24 * 60 * 60 * 1_000;

interface PublicTraceCacheEntry {
  tenantId: string;
  batchId: string;
  tenantVersion: number;
  batchVersion: number;
  value: PublicTraceOpenResult;
}

@Injectable()
export class PublicTraceCacheService {
  constructor(
    @Optional() @Inject(RUNTIME_STATE)
    private readonly store: RuntimeStateStore = new MemoryRuntimeStateService(),
  ) {}

  private codeKey(code: string): string {
    return `cache:public-trace:code:${code}`;
  }

  private tenantVersionKey(tenantId: string): string {
    return `cache:public-trace:tenant-version:${tenantId}`;
  }

  private batchVersionKey(batchId: string): string {
    return `cache:public-trace:batch-version:${batchId}`;
  }

  private async version(key: string): Promise<number> {
    return (await this.store.getJson<number>(key)) ?? 0;
  }

  async get(code: string): Promise<PublicTraceOpenResult | null> {
    const entry = await this.store.getJson<PublicTraceCacheEntry>(this.codeKey(code));
    if (!entry) return null;
    const [tenantVersion, batchVersion] = await Promise.all([
      this.version(this.tenantVersionKey(entry.tenantId)),
      this.version(this.batchVersionKey(entry.batchId)),
    ]);
    if (tenantVersion !== entry.tenantVersion || batchVersion !== entry.batchVersion) {
      await this.store.delete(this.codeKey(code));
      return null;
    }
    return entry.value;
  }

  async set(
    code: string,
    tenantId: string,
    batchId: string,
    value: PublicTraceOpenResult,
  ): Promise<void> {
    const [tenantVersion, batchVersion] = await Promise.all([
      this.version(this.tenantVersionKey(tenantId)),
      this.version(this.batchVersionKey(batchId)),
    ]);
    await this.store.setJson(this.codeKey(code), {
      tenantId,
      batchId,
      tenantVersion,
      batchVersion,
      value,
    } satisfies PublicTraceCacheEntry, PUBLIC_TRACE_CACHE_TTL_MS);
  }

  async invalidateBatch(batchId: string): Promise<void> {
    await this.store.increment(this.batchVersionKey(batchId), VERSION_TTL_MS);
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await this.store.increment(this.tenantVersionKey(tenantId), VERSION_TTL_MS);
  }
}
