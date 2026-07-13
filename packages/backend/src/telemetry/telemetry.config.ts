const FORBIDDEN_LABELS = new Set([
  'tenantid',
  'userid',
  'tracecode',
  'url',
  'objectkey',
  'prompt',
]);

export const TELEMETRY_CONFIG = Symbol('TELEMETRY_CONFIG');

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export interface TelemetryConfig {
  serviceName: string;
  otlpEndpoint?: string;
  metricsBearerToken?: string;
}

const OUTBOUND_OPERATIONS = new Set([
  'chat', 'vision', 'advice', 'diagnose', 'transcribe', 'upload', 'delete', 'payment', 'notify',
  'redis', 'queue', 'database',
]);
const OUTBOUND_PROVIDERS = new Set([
  'openai-compatible', 'xfyun', 'aliyun-oss', 'alipay', 'redis', 'bullmq', 'postgresql',
]);
const OUTBOUND_STATUSES = new Set(['ok', 'error', 'timeout', 'unknown']);

export interface OutboundSpanAttributes {
  operation: string;
  provider: string;
  status?: string;
}

export function sanitizeOutboundAttributes(input: OutboundSpanAttributes): Required<OutboundSpanAttributes> {
  return {
    operation: OUTBOUND_OPERATIONS.has(input.operation) ? input.operation : 'other',
    provider: OUTBOUND_PROVIDERS.has(input.provider) ? input.provider : 'other',
    status: input.status && OUTBOUND_STATUSES.has(input.status) ? input.status : 'unknown',
  };
}

export function assertMetricLabelPolicy(labels: readonly string[]): void {
  for (const label of labels) {
    if (FORBIDDEN_LABELS.has(label.replace(/[_-]/g, '').toLowerCase())) {
      throw new Error(`Forbidden metric label: ${label}`);
    }
    if (!/^[a-z][a-z0-9_]*$/.test(label)) {
      throw new Error(`Metric label must use bounded snake_case: ${label}`);
    }
  }
}

export function normalizeHttpMethod(method: string | undefined): string {
  const normalized = method?.trim().toUpperCase() ?? '';
  return HTTP_METHODS.has(normalized) ? normalized : 'OTHER';
}

function sanitizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] || '/';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const segments = normalized.split('/').map((segment) => {
    if (!segment || segment.startsWith(':')) return segment;
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[0-9a-f]{16,}$/i.test(segment)) return ':id';
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
    if (segment.length > 48) return ':value';
    return segment;
  });
  return segments.join('/').slice(0, 160) || '/';
}

export function normalizeHttpRoute(routeTemplate: string | undefined, rawUrl: string | undefined): string {
  return sanitizePath(routeTemplate?.trim() || rawUrl?.trim() || '/unmatched');
}

export function statusClass(statusCode: number | undefined): string {
  if (!Number.isInteger(statusCode) || statusCode! < 100 || statusCode! > 599) return 'unknown';
  return `${Math.floor(statusCode! / 100)}xx`;
}

export function readTelemetryConfig(env: NodeJS.ProcessEnv = process.env): TelemetryConfig {
  const serviceName = env.OTEL_SERVICE_NAME?.trim() || 'nongchang-backend';
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(serviceName)) {
    throw new Error('[startup validation] OTEL_SERVICE_NAME must be 1-64 stable characters');
  }

  const rawEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  let otlpEndpoint: string | undefined;
  if (rawEndpoint) {
    let parsed: URL;
    try {
      parsed = new URL(rawEndpoint);
    } catch {
      throw new Error('[startup validation] OTEL_EXPORTER_OTLP_ENDPOINT must be an absolute HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('[startup validation] OTEL_EXPORTER_OTLP_ENDPOINT must be an absolute HTTP(S) URL');
    }
    otlpEndpoint = parsed.toString();
  }

  const metricsBearerToken = env.METRICS_BEARER_TOKEN?.trim() || undefined;
  if (metricsBearerToken && metricsBearerToken.length < 24) {
    throw new Error('[startup validation] METRICS_BEARER_TOKEN must contain at least 24 characters');
  }

  return { serviceName, otlpEndpoint, metricsBearerToken };
}
