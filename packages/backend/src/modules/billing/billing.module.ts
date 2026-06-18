import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { AlipayService } from './alipay.service';
import { BillingController } from './billing.controller';

@Module({ providers: [BillingService, AlipayService], controllers: [BillingController], exports: [BillingService] })
export class BillingModule {}
