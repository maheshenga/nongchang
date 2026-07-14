import { useMemo, useRef, useState } from 'react';
import { Layers, Plus, QrCode, Search } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { confirmDialog } from '../hooks/useDialog';
import { showToast } from '../hooks/useToast';
import { listBatches } from '../api/batches';
import { getBillingSummary } from '../api/billing';
import { listFields } from '../api/fields';
import { createTraceGenerationRequestKey, generateCodes } from '../api/trace';
import type { AppTab } from '../navigation';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { buildIdentityMap } from '../ui/identity';
import { STATUS_LABEL, statusTone, toViewBatch } from './BatchAdmin.model';
import { BatchLabelWorkspace } from './batch-admin/BatchLabelWorkspace';
import type { PendingAction } from './batch-admin/BatchAnalysisDialogs';

interface MerchantAdminProps {
  onNavigate?: (tab: AppTab) => void;
}

export default function MerchantAdmin({ onNavigate }: MerchantAdminProps) {
  const batchesApi = useApi(listBatches, { cacheKey: 'batches' });
  const fieldsApi = useApi(listFields, { cacheKey: 'fields' });
  const billing = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
  const fieldNames = useMemo(
    () => buildIdentityMap(fieldsApi.data ?? [], field => field.id, field => field.name),
    [fieldsApi.data],
  );
  const batches = useMemo(
    () => (batchesApi.data ?? []).map(batch => toViewBatch(batch, fieldNames)),
    [batchesApi.data, fieldNames],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [labelBatchId, setLabelBatchId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const generationRequestKeys = useRef<Record<string, string>>({});
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredBatches = useMemo(
    () => batches.filter(batch => (
      batch.type.toLowerCase().includes(normalizedQuery)
      || batch.code.toLowerCase().includes(normalizedQuery)
      || batch.id.toLowerCase().includes(normalizedQuery)
    )),
    [batches, normalizedQuery],
  );
  const labelBatch = batches.find(batch => batch.id === labelBatchId);

  const requestConfirmation = (action: PendingAction) => {
    void confirmDialog({
      title: action.title,
      message: action.description,
      confirmLabel: '确认生成',
      cancelLabel: '取消',
      tone: 'danger',
    }).then(confirmed => confirmed ? action.onConfirm() : undefined);
  };

  const handleGenerateCodes = async (count: number): Promise<string[]> => {
    if (!labelBatchId) return [];
    const operation = `product-archive-label:${labelBatchId}:${count}`;
    generationRequestKeys.current[operation] ??= createTraceGenerationRequestKey(
      'product-archive-label',
      labelBatchId,
      count,
    );
    setGenerating(true);
    try {
      const codes = await generateCodes(labelBatchId, count, generationRequestKeys.current[operation]);
      delete generationRequestKeys.current[operation];
      void Promise.allSettled([batchesApi.reload(), billing.reload()]);
      return codes.map(code => code.code);
    } catch (error) {
      showToast(error instanceof Error ? `生成真实溯源码失败:${error.message}` : '生成真实溯源码失败');
      return [];
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 border border-[#E1DFDD] bg-[#FAFAFA] p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative min-w-0 md:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
          <input
            type="search"
            aria-label="搜索批次或作物名称"
            placeholder="搜索批次或作物名称..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className={`${fluentInput} w-full pl-8`}
          />
        </div>
        <button type="button" onClick={() => onNavigate?.('batches')} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" /> 新增生产批次
        </button>
      </header>

      {batchesApi.loading && <LoadingState label="加载批次档案" />}
      {batchesApi.error && <ErrorState message={batchesApi.error} onRetry={() => void batchesApi.reload()} />}
      {!batchesApi.loading && !batchesApi.error && filteredBatches.length === 0 && (
        <EmptyState title="暂无批次档案" description="请先在批次管理中创建生产批次。" />
      )}

      {!batchesApi.loading && !batchesApi.error && filteredBatches.length > 0 && (
        <div className="hidden md:block">
          <div className={fluentTable.wrapper}>
            <table className={`${fluentTable.table} min-w-[760px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>产品</th>
                  <th className={fluentTable.th}>批次号</th>
                  <th className={fluentTable.th}>生命周期</th>
                  <th className={`${fluentTable.th} text-right`}>已生成</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(batch => (
                  <tr key={batch.id} className={fluentTable.row}>
                    <td className={`${fluentTable.td} font-semibold text-[#242424]`}>{batch.type}</td>
                    <td className={`${fluentTable.td} font-mono text-xs text-[#605E5C]`}>{batch.code}</td>
                    <td className={fluentTable.td}>
                      <span className={fluentStatusTag(statusTone(batch.stage))}>
                        {STATUS_LABEL[batch.stage] ?? batch.stage}
                      </span>
                    </td>
                    <td className={`${fluentTable.td} text-right font-mono font-semibold`}>{batch.generated}</td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`配置溯源标签 ${batch.code}`}
                          onClick={() => setLabelBatchId(batch.id)}
                          className={fluentButton('primary')}
                        >
                          <QrCode className="h-4 w-4" /> 配置溯源标签
                        </button>
                        <button
                          type="button"
                          aria-label={`进入批次管理 ${batch.code}`}
                          onClick={() => onNavigate?.('batches')}
                          className={fluentButton('secondary')}
                        >
                          <Layers className="h-4 w-4" /> 进入批次管理
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!batchesApi.loading && !batchesApi.error && filteredBatches.length > 0 && (
        <div role="list" aria-label="产品档案列表" className="grid gap-3 md:hidden">
          {filteredBatches.map(batch => (
            <article
              key={batch.id}
              role="listitem"
              aria-label={`产品档案 ${batch.code}`}
              className="border border-[#E1DFDD] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-[#242424]">{batch.type}</div>
                  <div className="mt-1 font-mono text-xs text-[#605E5C]">{batch.code}</div>
                </div>
                <span className={fluentStatusTag(statusTone(batch.stage))}>
                  {STATUS_LABEL[batch.stage] ?? batch.stage}
                </span>
              </div>
              <div className="mt-3 border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 text-sm text-[#605E5C]">
                已生成 <span className="font-mono font-semibold text-[#242424]">{batch.generated}</span> 枚溯源码
              </div>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  aria-label={`配置溯源标签 ${batch.code}`}
                  onClick={() => setLabelBatchId(batch.id)}
                  className={`${fluentButton('primary')} w-full`}
                >
                  <QrCode className="h-4 w-4" /> 配置溯源标签
                </button>
                <button
                  type="button"
                  aria-label={`进入批次管理 ${batch.code}`}
                  onClick={() => onNavigate?.('batches')}
                  className={`${fluentButton('secondary')} w-full`}
                >
                  <Layers className="h-4 w-4" /> 进入批次管理
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {labelBatch && (
        <BatchLabelWorkspace
          batch={labelBatch}
          codeBalance={billing.data?.codeBalance ?? null}
          quotaLoading={billing.loading}
          quotaError={billing.error}
          billingAvailable={false}
          generating={generating}
          onGenerate={handleGenerateCodes}
          requestConfirmation={requestConfirmation}
          onOpenBilling={() => undefined}
          onRetryQuota={() => void billing.reload()}
          onClose={() => setLabelBatchId(null)}
        />
      )}
    </div>
  );
}
