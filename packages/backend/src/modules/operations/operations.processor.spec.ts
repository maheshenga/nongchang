import { describe, expect, it, vi } from 'vitest';
import { OperationsProcessor } from './operations.processor';

function makeProcessor() {
  const ai = { reconcileStale: vi.fn().mockResolvedValue({ scanned: 1, errors: [] }) };
  const quota = {
    listStalePending: vi.fn().mockResolvedValue([
      { id: 'asset-1', tenantId: 't1', objectKey: 't1/farm-record/a.jpg' },
    ]),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const oss = { delete: vi.fn().mockResolvedValue(undefined) };
  const audit = { run: vi.fn().mockResolvedValue({ status: 'ok' }) };
  return {
    processor: new OperationsProcessor(ai as never, quota as never, oss as never, audit as never),
    ai, quota, oss, audit,
  };
}

describe('OperationsProcessor', () => {
  it('runs bounded AI reconciliation with a stable payload', async () => {
    const { processor, ai } = makeProcessor();
    await expect(processor.process('ai-reconcile', {
      cutoffIso: '2026-07-13T00:00:00.000Z', limit: 100, dryRun: false,
    })).resolves.toMatchObject({ scanned: 1 });
    expect(ai.reconcileStale).toHaveBeenCalledWith({
      cutoff: new Date('2026-07-13T00:00:00.000Z'), take: 100, dryRun: false,
    });
  });

  it('cleans stale uploads without leaking object details into the result', async () => {
    const { processor, quota, oss } = makeProcessor();
    await expect(processor.process('upload-cleanup', {
      cutoffIso: '2026-07-13T00:00:00.000Z', limit: 10, dryRun: false,
    })).resolves.toEqual({ matched: 1, deleted: 1, failed: 0 });
    expect(oss.delete).toHaveBeenCalledWith('t1/farm-record/a.jpg', 't1');
    expect(quota.release).toHaveBeenCalledWith('asset-1', 'DELETED');
  });

  it('runs the operational audit and rejects unbounded payloads', async () => {
    const { processor, audit } = makeProcessor();
    await expect(processor.process('operational-audit', {
      cutoffIso: '2026-07-13T00:00:00.000Z', limit: 100, dryRun: true,
    })).resolves.toEqual({ status: 'ok' });
    expect(audit.run).toHaveBeenCalledOnce();

    await expect(processor.process('ai-reconcile', {
      cutoffIso: '2026-07-13T00:00:00.000Z', limit: 1001, dryRun: false,
    })).rejects.toThrow(/limit/);
  });
});
