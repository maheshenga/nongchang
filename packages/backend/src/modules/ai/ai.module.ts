import { Module } from '@nestjs/common';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { IntegrationModule } from '../integration/integration.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [AiProviderModule, IntegrationModule],
  providers: [AiService],
  controllers: [AiController],
})
export class AiModule {}
