import { SpanStatusCode, trace } from '@opentelemetry/api';
import { sanitizeOutboundAttributes, type OutboundSpanAttributes } from './telemetry.config';
import type { MetricsService } from './metrics.service';

const tracer = trace.getTracer('nongchang-outbound');

export async function withOutboundSpan<T>(
  input: Omit<OutboundSpanAttributes, 'status'>,
  operation: () => Promise<T>,
  metrics?: MetricsService,
): Promise<T> {
  const attributes = sanitizeOutboundAttributes(input);
  const startedAt = performance.now();
  return tracer.startActiveSpan(`outbound.${attributes.provider}.${attributes.operation}`, async (span) => {
    span.setAttributes({
      'outbound.provider': attributes.provider,
      'outbound.operation': attributes.operation,
    });
    try {
      const result = await operation();
      span.setAttribute('outbound.status', 'ok');
      span.setStatus({ code: SpanStatusCode.OK });
      metrics?.observeOutbound({ ...attributes, status: 'ok', durationSeconds: (performance.now() - startedAt) / 1_000 });
      return result;
    } catch (error) {
      span.setAttribute('outbound.status', 'error');
      span.setStatus({ code: SpanStatusCode.ERROR });
      metrics?.observeOutbound({ ...attributes, status: 'error', durationSeconds: (performance.now() - startedAt) / 1_000 });
      throw error;
    } finally {
      span.end();
    }
  });
}
