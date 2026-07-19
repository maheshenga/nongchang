import { Role } from '@nongchang/shared';
import { describe, expect, it } from 'vitest';
import { MemoryRuntimeStateService } from '../common/runtime/memory-runtime-state.service';
import { SessionValidationCacheService } from './session-validation-cache.service';

describe('SessionValidationCacheService', () => {
  it('shares minimal session identity and invalidates one user or a whole tenant', async () => {
    const store = new MemoryRuntimeStateService();
    const first = new SessionValidationCacheService(store);
    const second = new SessionValidationCacheService(store);
    const user = {
      userId: 'u1', tenantId: 't1', role: Role.MERCHANT,
      agentId: null, ownerId: 'u1', sessionVersion: 2,
    };

    await first.set(user);
    await expect(second.get('t1', 'u1', 2)).resolves.toEqual(user);
    await second.invalidateUser('t1', 'u1');
    await expect(first.get('t1', 'u1', 2)).resolves.toBeNull();

    await first.set(user);
    await first.set({ ...user, userId: 'u2', ownerId: 'u2' });
    await second.invalidateTenant('t1');
    await expect(first.get('t1', 'u1', 2)).resolves.toBeNull();
    await expect(first.get('t1', 'u2', 2)).resolves.toBeNull();
  });
});
