import { Module } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';
import { PublicTraceController } from './public-trace.controller';
import { PublicTraceCacheModule } from './public-trace-cache.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';

@Module({
  imports: [PublicTraceCacheModule, TenantSettingsModule],
  providers: [PublicTraceService],
  controllers: [PublicTraceController],
})
export class PublicTraceModule {}
