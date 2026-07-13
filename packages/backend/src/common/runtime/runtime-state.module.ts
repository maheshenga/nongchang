import { Global, Module } from '@nestjs/common';
import { MemoryRuntimeStateService } from './memory-runtime-state.service';
import { RedisRuntimeStateService } from './redis-runtime-state.service';
import { RUNTIME_STATE, readRedisUrl, readRuntimeStateDriver } from './runtime-state.types';
import { SessionValidationCacheService } from '../../auth/session-validation-cache.service';
import { IdempotencyLockService } from './idempotency-lock.service';

@Global()
@Module({
  providers: [
    {
      provide: RUNTIME_STATE,
      useFactory: async () => {
        if (readRuntimeStateDriver() === 'memory') return new MemoryRuntimeStateService();
        const store = new RedisRuntimeStateService(readRedisUrl());
        await store.connect();
        return store;
      },
    },
    SessionValidationCacheService,
    IdempotencyLockService,
  ],
  exports: [RUNTIME_STATE, SessionValidationCacheService, IdempotencyLockService],
})
export class RuntimeStateModule {}
