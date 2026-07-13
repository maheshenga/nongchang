import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import {
  assertMetricLabelPolicy,
  normalizeHttpMethod,
  normalizeHttpRoute,
  sanitizeOutboundAttributes,
  statusClass,
} from './telemetry.config';

const QUEUES = new Set(['platform-operations']);
const JOBS = new Set(['ai-reconcile', 'upload-cleanup', 'operational-audit']);
const RECONCILIATION_KINDS = new Set(['ai', 'billing', 'upload']);
const DATABASE_OPERATIONS = new Map([
  ['findMany', 'find_many'], ['findFirst', 'find_first'], ['findUnique', 'find_unique'],
  ['create', 'create'], ['createMany', 'create_many'], ['update', 'update'], ['updateMany', 'update_many'],
  ['upsert', 'upsert'], ['delete', 'delete'], ['deleteMany', 'delete_many'], ['count', 'count'],
  ['aggregate', 'aggregate'], ['groupBy', 'group_by'], ['queryRaw', 'query_raw'], ['executeRaw', 'execute_raw'],
]);

function bounded(value: string, allowed: Set<string>): string {
  return allowed.has(value) ? value : 'other';
}

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpDuration: Histogram<'method' | 'route' | 'status_class'>;
  private readonly runtimeStateUp: Gauge;
  private readonly queueDepth: Gauge<'queue'>;
  private readonly queueOldestAge: Gauge<'queue'>;
  private readonly queueFailures: Counter<'queue' | 'job'>;
  private readonly reconciliationErrors: Counter<'kind'>;
  private readonly backupAge: Gauge;
  private readonly databaseDuration: Histogram<'operation' | 'status'>;
  private readonly databaseErrors: Counter<'operation'>;
  private readonly outboundDuration: Histogram<'provider' | 'operation' | 'status'>;
  private readonly databasePoolSaturation: Gauge;

  constructor() {
    assertMetricLabelPolicy(['method', 'route', 'status_class']);
    assertMetricLabelPolicy(['queue', 'job', 'kind']);
    assertMetricLabelPolicy(['operation', 'provider', 'status']);

    this.httpDuration = new Histogram({
      name: 'nongchang_http_request_duration_seconds',
      help: 'HTTP request duration using normalized route templates',
      labelNames: ['method', 'route', 'status_class'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.runtimeStateUp = new Gauge({
      name: 'nongchang_runtime_state_up',
      help: 'Whether the configured runtime state backend is available',
      registers: [this.registry],
    });
    this.queueDepth = new Gauge({
      name: 'nongchang_queue_depth',
      help: 'Number of waiting jobs in a bounded operations queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });
    this.queueOldestAge = new Gauge({
      name: 'nongchang_queue_oldest_job_age_seconds',
      help: 'Age of the oldest waiting job in seconds',
      labelNames: ['queue'],
      registers: [this.registry],
    });
    this.queueFailures = new Counter({
      name: 'nongchang_queue_failures_total',
      help: 'Queue failures by bounded queue and job category',
      labelNames: ['queue', 'job'],
      registers: [this.registry],
    });
    this.reconciliationErrors = new Counter({
      name: 'nongchang_reconciliation_errors_total',
      help: 'Reconciliation errors by bounded subsystem category',
      labelNames: ['kind'],
      registers: [this.registry],
    });
    this.backupAge = new Gauge({
      name: 'nongchang_backup_age_seconds',
      help: 'Age of the latest verified database backup in seconds',
      registers: [this.registry],
    });
    this.databaseDuration = new Histogram({
      name: 'nongchang_database_operation_duration_seconds',
      help: 'Database operation duration by bounded operation and result status',
      labelNames: ['operation', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.databaseErrors = new Counter({
      name: 'nongchang_database_errors_total',
      help: 'Database errors by bounded operation category',
      labelNames: ['operation'],
      registers: [this.registry],
    });
    this.outboundDuration = new Histogram({
      name: 'nongchang_outbound_operation_duration_seconds',
      help: 'Outbound dependency duration by bounded provider operation and status',
      labelNames: ['provider', 'operation', 'status'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });
    this.databasePoolSaturation = new Gauge({
      name: 'nongchang_database_pool_saturation_ratio',
      help: 'Observed database connection usage divided by configured pool capacity',
      registers: [this.registry],
    });
  }

  observeHttp(input: {
    method?: string;
    routeTemplate?: string;
    rawUrl?: string;
    statusCode?: number;
    durationSeconds: number;
  }): void {
    this.httpDuration
      .labels(
        normalizeHttpMethod(input.method),
        normalizeHttpRoute(input.routeTemplate, input.rawUrl),
        statusClass(input.statusCode),
      )
      .observe(Math.max(0, input.durationSeconds));
  }

  setRuntimeStateAvailable(available: boolean): void {
    this.runtimeStateUp.set(available ? 1 : 0);
  }

  setQueueState(input: { queue: string; depth: number; oldestJobAgeSeconds: number }): void {
    const queue = bounded(input.queue, QUEUES);
    this.queueDepth.labels(queue).set(Math.max(0, input.depth));
    this.queueOldestAge.labels(queue).set(Math.max(0, input.oldestJobAgeSeconds));
  }

  recordQueueFailure(input: { queue: string; job: string }): void {
    this.queueFailures.labels(bounded(input.queue, QUEUES), bounded(input.job, JOBS)).inc();
  }

  recordReconciliationError(kind: string): void {
    this.reconciliationErrors.labels(bounded(kind, RECONCILIATION_KINDS)).inc();
  }

  setBackupAgeSeconds(seconds: number): void {
    this.backupAge.set(Math.max(0, seconds));
  }

  observeDatabase(input: { operation: string; status: 'ok' | 'error'; durationSeconds: number }): void {
    const operation = DATABASE_OPERATIONS.get(input.operation) ?? 'other';
    this.databaseDuration.labels(operation, input.status).observe(Math.max(0, input.durationSeconds));
    if (input.status === 'error') this.databaseErrors.labels(operation).inc();
  }

  observeOutbound(input: {
    provider: string;
    operation: string;
    status: 'ok' | 'error' | 'timeout';
    durationSeconds: number;
  }): void {
    const labels = sanitizeOutboundAttributes(input);
    this.outboundDuration
      .labels(labels.provider, labels.operation, labels.status)
      .observe(Math.max(0, input.durationSeconds));
  }

  setDatabasePoolSaturationRatio(ratio: number): void {
    this.databasePoolSaturation.set(Math.min(1, Math.max(0, ratio)));
  }

  exposition(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
