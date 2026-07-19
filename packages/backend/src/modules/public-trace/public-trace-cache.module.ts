import { Global, Module } from '@nestjs/common';
import { PublicTraceCacheService } from './public-trace-cache.service';

@Global()
@Module({
  providers: [PublicTraceCacheService],
  exports: [PublicTraceCacheService],
})
export class PublicTraceCacheModule {}
