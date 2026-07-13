import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';
import { MemoryRuntimeStateService } from '../common/runtime/memory-runtime-state.service';
import { RUNTIME_STATE, type RuntimeStateStore } from '../common/runtime/runtime-state.types';

const SESSION_VALIDATION_TTL_MS = 15_000;

@Injectable()
export class SessionValidationCacheService {
  constructor(
    @Optional() @Inject(RUNTIME_STATE)
    private readonly store: RuntimeStateStore = new MemoryRuntimeStateService(),
  ) {}

  private tenantPrefix(tenantId: string): string {
    return `cache:session:tenant:${tenantId}:`;
  }

  private userPrefix(tenantId: string, userId: string): string {
    return `${this.tenantPrefix(tenantId)}user:${userId}:`;
  }

  private key(tenantId: string, userId: string, sessionVersion: number): string {
    return `${this.userPrefix(tenantId, userId)}version:${sessionVersion}`;
  }

  get(tenantId: string, userId: string, sessionVersion: number): Promise<AuthUser | null> {
    return this.store.getJson<AuthUser>(this.key(tenantId, userId, sessionVersion));
  }

  set(user: AuthUser): Promise<void> {
    return this.store.setJson(
      this.key(user.tenantId, user.userId, user.sessionVersion ?? 0),
      user,
      SESSION_VALIDATION_TTL_MS,
    );
  }

  async invalidateUser(tenantId: string, userId: string): Promise<void> {
    await this.store.deleteByPrefix(this.userPrefix(tenantId, userId));
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await this.store.deleteByPrefix(this.tenantPrefix(tenantId));
  }
}
