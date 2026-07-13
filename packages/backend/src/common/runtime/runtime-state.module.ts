import { Global, Module } from '@nestjs/common';
import { MemoryRuntimeStateService } from './memory-runtime-state.service';
import { RedisRuntimeStateService } from './redis-runtime-state.service';
import { RUNTIME_STATE, readRedisUrl, readRuntimeStateDriver } from './runtime-state.types';

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
  ],
  exports: [RUNTIME_STATE],
})
export class RuntimeStateModule {}
