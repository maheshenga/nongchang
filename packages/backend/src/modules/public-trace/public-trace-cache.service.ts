import { Injectable } from '@nestjs/common';
import { PUBLIC_TRACE_CACHE_TTL_MS } from '@nongchang/shared';
import type { PublicTraceOpenResult } from './public-trace.model';

interface PublicTraceCacheEntry {
  expiresAt: number;
  tenantId: string;
  batchId: string;
  value: PublicTraceOpenResult;
}

@Injectable()
export class PublicTraceCacheService {
  private readonly entries = new Map<string, PublicTraceCacheEntry>();

  get(code: string): PublicTraceOpenResult | null {
    const entry = this.entries.get(code);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(code);
      return null;
    }
    return entry.value;
  }

  set(code: string, tenantId: string, batchId: string, value: PublicTraceOpenResult): void {
    this.entries.set(code, { expiresAt: Date.now() + PUBLIC_TRACE_CACHE_TTL_MS, tenantId, batchId, value });
  }

  invalidateBatch(batchId: string): void {
    for (const [code, entry] of this.entries) {
      if (entry.batchId === batchId) this.entries.delete(code);
    }
  }

  invalidateTenant(tenantId: string): void {
    for (const [code, entry] of this.entries) {
      if (entry.tenantId === tenantId) this.entries.delete(code);
    }
  }
}
