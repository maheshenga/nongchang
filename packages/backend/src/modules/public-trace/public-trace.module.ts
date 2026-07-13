import { Global, Module } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';
import { PublicTraceController } from './public-trace.controller';
import { PublicTraceCacheService } from './public-trace-cache.service';

@Global()
@Module({
  providers: [PublicTraceService, PublicTraceCacheService],
  controllers: [PublicTraceController],
  exports: [PublicTraceCacheService],
})
export class PublicTraceModule {}
