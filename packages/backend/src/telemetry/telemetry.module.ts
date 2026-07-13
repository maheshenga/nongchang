import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { readTelemetryConfig, TELEMETRY_CONFIG } from './telemetry.config';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: TELEMETRY_CONFIG, useFactory: () => readTelemetryConfig(process.env) }],
  exports: [MetricsService, TELEMETRY_CONFIG],
})
export class TelemetryModule {}
