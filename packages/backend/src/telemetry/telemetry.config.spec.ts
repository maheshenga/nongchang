import { describe, expect, it } from 'vitest';
import {
  assertMetricLabelPolicy,
  normalizeHttpMethod,
  normalizeHttpRoute,
  readTelemetryConfig,
  sanitizeOutboundAttributes,
  statusClass,
} from './telemetry.config';

describe('telemetry configuration', () => {
  it.each(['tenantId', 'userId', 'traceCode', 'url', 'objectKey', 'prompt'])(
    'rejects forbidden metric label %s',
    (label) => {
      expect(() => assertMetricLabelPolicy([label])).toThrow(/forbidden metric label/i);
    },
  );

  it('accepts the bounded HTTP metric label vocabulary', () => {
    expect(() => assertMetricLabelPolicy(['method', 'route', 'status_class'])).not.toThrow();
  });

  it('normalizes route templates, methods, and status classes', () => {
    expect(normalizeHttpRoute('/api/fields/:id', '/api/fields/507f1f77bcf86cd799439011?token=secret')).toBe(
      '/api/fields/:id',
    );
    expect(normalizeHttpRoute(undefined, '/api/fields/507f1f77bcf86cd799439011?token=secret')).toBe(
      '/api/fields/:id',
    );
    expect(normalizeHttpMethod('post')).toBe('POST');
    expect(normalizeHttpMethod('BREW')).toBe('OTHER');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(503)).toBe('5xx');
  });

  it('enables OTLP only for an explicitly configured HTTP endpoint', () => {
    expect(readTelemetryConfig({})).toMatchObject({ otlpEndpoint: undefined, serviceName: 'nongchang-backend' });
    expect(
      readTelemetryConfig({
        OTEL_SERVICE_NAME: 'nongchang-api',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces',
      }),
    ).toMatchObject({ serviceName: 'nongchang-api', otlpEndpoint: 'https://otel.example/v1/traces' });
    expect(() => readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'file:///tmp/traces' })).toThrow(
      /OTEL_EXPORTER_OTLP_ENDPOINT/,
    );
  });

  it('keeps outbound span attributes bounded and drops payload-shaped input', () => {
    expect(
      sanitizeOutboundAttributes({
        operation: 'chat',
        provider: 'openai-compatible',
        status: 'ok',
        url: 'https://secret.example',
        prompt: 'secret prompt',
      } as never),
    ).toEqual({ operation: 'chat', provider: 'openai-compatible', status: 'ok' });
    expect(sanitizeOutboundAttributes({ operation: 'unknown-operation', provider: 'private-provider' })).toEqual({
      operation: 'other',
      provider: 'other',
      status: 'unknown',
    });
  });
});
