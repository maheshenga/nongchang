import { Injectable, Optional } from '@nestjs/common';
import { AiBillingCoordinator } from '../billing/ai-billing-coordinator';
import { UploadQuotaService } from '../upload/upload-quota.service';
import { OssService } from '../upload/oss.service';
import { OperationsAuditService } from './operations-audit.service';
import type { OperationsJobName, OperationsJobPayload } from './operations.constants';
import { MetricsService } from '../../telemetry/metrics.service';

@Injectable()
export class OperationsProcessor {
  constructor(
    private readonly ai: AiBillingCoordinator,
    private readonly quota: UploadQuotaService,
    private readonly oss: OssService,
    private readonly audit: OperationsAuditService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private normalize(payload: OperationsJobPayload) {
    if (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 1_000) {
      throw new Error('limit must be an integer between 1 and 1000');
    }
    const olderThanMinutes = payload.olderThanMinutes ?? 60;
    if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 1 || olderThanMinutes > 43_200) {
      throw new Error('olderThanMinutes must be an integer between 1 and 43200');
    }
    const cutoff = payload.cutoffIso
      ? new Date(payload.cutoffIso)
      : new Date(Date.now() - olderThanMinutes * 60_000);
    if (Number.isNaN(cutoff.getTime())) throw new Error('cutoffIso must be a valid ISO date');
    return { cutoff, limit: payload.limit, dryRun: payload.dryRun };
  }

  async process(name: OperationsJobName, payload: OperationsJobPayload): Promise<unknown> {
    const options = this.normalize(payload);
    if (name === 'ai-reconcile') {
      try {
        const result = await this.ai.reconcileStale({
          cutoff: options.cutoff,
          take: options.limit,
          dryRun: options.dryRun,
        });
        if (Array.isArray((result as { errors?: unknown[] }).errors)) {
          for (const _error of (result as { errors: unknown[] }).errors) this.metrics?.recordReconciliationError('ai');
        }
        return result;
      } catch (error) {
        this.metrics?.recordReconciliationError('ai');
        throw error;
      }
    }
    if (name === 'operational-audit') return this.audit.run(options.cutoff);
    if (name !== 'upload-cleanup') throw new Error(`unsupported operations job: ${String(name)}`);

    const assets = await this.quota.listStalePending(options.cutoff, options.limit);
    const summary = { matched: assets.length, deleted: 0, failed: 0 };
    if (options.dryRun) return summary;
    for (const asset of assets) {
      try {
        await this.oss.delete(asset.objectKey, asset.tenantId);
        await this.quota.release(asset.id, 'DELETED');
        summary.deleted += 1;
      } catch {
        summary.failed += 1;
        this.metrics?.recordReconciliationError('upload');
      }
    }
    return summary;
  }
}
