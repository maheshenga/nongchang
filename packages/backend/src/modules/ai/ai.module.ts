import { Module } from '@nestjs/common';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [AiProviderModule],
  providers: [AiService],
  controllers: [AiController],
})
export class AiModule {}
