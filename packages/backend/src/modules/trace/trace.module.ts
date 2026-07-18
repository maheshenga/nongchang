import { Module } from '@nestjs/common';
import { TraceService } from './trace.service';
import { TraceController } from './trace.controller';
import { ScopeService } from '../../common/scope/scope.service';
import { BillingModule } from '../billing/billing.module';
import { TraceLabelPdfRenderer } from './trace-label-pdf.renderer';
import { TraceLabelPdfService } from './trace-label-pdf.service';

@Module({
  imports: [BillingModule],
  providers: [TraceService, TraceLabelPdfService, TraceLabelPdfRenderer, ScopeService],
  controllers: [TraceController],
})
export class TraceModule {}
