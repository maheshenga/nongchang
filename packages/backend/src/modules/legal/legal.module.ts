import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { LegalSettingsController } from './legal-settings.controller';
import { LegalService } from './legal.service';
import { PublicLegalController } from './public-legal.controller';

@Module({
  imports: [IntegrationModule],
  controllers: [LegalSettingsController, PublicLegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
