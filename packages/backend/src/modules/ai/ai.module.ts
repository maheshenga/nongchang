import { Module } from '@nestjs/common';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { IntegrationModule } from '../integration/integration.module';
import { BillingModule } from '../billing/billing.module';
import { ScopeService } from '../../common/scope/scope.service';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [AiProviderModule, IntegrationModule, BillingModule],
  providers: [AiService, ScopeService],
  controllers: [AiController],
})
export class AiModule {}
