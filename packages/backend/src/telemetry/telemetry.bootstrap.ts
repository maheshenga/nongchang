import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { readTelemetryConfig } from './telemetry.config';

const config = readTelemetryConfig(process.env);

if (config.otlpEndpoint) {
  const sdk = new NodeSDK({
    serviceName: config.serviceName,
    traceExporter: new OTLPTraceExporter({ url: config.otlpEndpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          headersToSpanAttributes: {
            client: { requestHeaders: [], responseHeaders: [] },
            server: { requestHeaders: [], responseHeaders: [] },
          },
        },
      }),
    ],
  });
  sdk.start();
  const shutdown = () => void sdk.shutdown();
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
