import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { AlipayService } from './alipay.service';
import { BillingController } from './billing.controller';
import { AiBillingCoordinator } from './ai-billing-coordinator';

@Module({
  providers: [BillingService, AlipayService, AiBillingCoordinator],
  controllers: [BillingController],
  exports: [BillingService, AiBillingCoordinator],
})
export class BillingModule {}
