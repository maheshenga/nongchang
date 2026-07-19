import { describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('exports normalized low-cardinality HTTP metrics in Prometheus format', async () => {
    const metrics = new MetricsService();

    metrics.observeHttp({
      method: 'post',
      routeTemplate: '/api/traces/:id',
      rawUrl: '/api/traces/trace-secret?prompt=do-not-export',
      statusCode: 503,
      durationSeconds: 0.25,
    });

    const output = await metrics.exposition();
    expect(output).toContain('nongchang_http_request_duration_seconds');
    expect(output).toContain('method="POST"');
    expect(output).toContain('route="/api/traces/:id"');
    expect(output).toContain('status_class="5xx"');
    expect(output).not.toContain('trace-secret');
    expect(output).not.toContain('do-not-export');
    expect(output).not.toMatch(/tenantId|userId|traceCode|objectKey|prompt|url=/);
  });

  it('exports bounded runtime, queue, reconciliation, and backup metrics', async () => {
    const metrics = new MetricsService();
    metrics.setRuntimeStateAvailable(true);
    metrics.setQueueState({ queue: 'platform-operations', depth: 3, oldestJobAgeSeconds: 12 });
    metrics.recordQueueFailure({ queue: 'platform-operations', job: 'ai-reconcile' });
    metrics.recordReconciliationError('ai');
    metrics.setBackupAgeSeconds(3600);
    metrics.setDatabasePoolSaturationRatio(0.75);

    const output = await metrics.exposition();
    expect(output).toContain('nongchang_runtime_state_up 1');
    expect(output).toContain('nongchang_queue_depth{queue="platform-operations"} 3');
    expect(output).toContain('nongchang_queue_oldest_job_age_seconds{queue="platform-operations"} 12');
    expect(output).toContain('nongchang_queue_failures_total{queue="platform-operations",job="ai-reconcile"} 1');
    expect(output).toContain('nongchang_reconciliation_errors_total{kind="ai"} 1');
    expect(output).toContain('nongchang_backup_age_seconds 3600');
    expect(output).toContain('nongchang_database_pool_saturation_ratio 0.75');
  });

  it('exports bounded database and outbound boundary metrics', async () => {
    const metrics = new MetricsService();
    metrics.observeDatabase({ operation: 'findMany', status: 'ok', durationSeconds: 0.01 });
    metrics.observeDatabase({ operation: 'unsafe-raw-query', status: 'error', durationSeconds: 0.02 });
    metrics.observeOutbound({ provider: 'alipay', operation: 'payment', status: 'ok', durationSeconds: 0.3 });

    const output = await metrics.exposition();
    expect(output).toContain('nongchang_database_operation_duration_seconds');
    expect(output).toContain('operation="find_many"');
    expect(output).toContain('operation="other"');
    expect(output).toContain('nongchang_database_errors_total{operation="other"} 1');
    expect(output).toContain('nongchang_outbound_operation_duration_seconds');
    expect(output).toContain('provider="alipay",operation="payment",status="ok"');
  });
});
