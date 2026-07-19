import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { UploadModule } from '../upload/upload.module';
import { OperationsAuditService } from './operations-audit.service';
import { OperationsProcessor } from './operations.processor';
import { OperationsQueueService } from './operations-queue.service';

@Module({
  imports: [BillingModule, UploadModule],
  providers: [OperationsAuditService, OperationsProcessor, OperationsQueueService],
  exports: [OperationsProcessor],
})
export class OperationsModule {}
