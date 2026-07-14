import { Module } from '@nestjs/common';
import { TenantReadinessController } from './tenant-readiness.controller';
import { TenantReadinessService } from './tenant-readiness.service';

@Module({
  controllers: [TenantReadinessController],
  providers: [TenantReadinessService],
})
export class ReadinessModule {}
