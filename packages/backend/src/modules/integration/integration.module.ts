import { Module } from '@nestjs/common';
import { IntegrationConfigService } from './integration-config.service';
import { IntegrationConfigController } from './integration-config.controller';

@Module({
  providers: [IntegrationConfigService],
  controllers: [IntegrationConfigController],
  exports: [IntegrationConfigService],
})
export class IntegrationModule {}
