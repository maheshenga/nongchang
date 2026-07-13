import { useMemo, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { showToast } from '../hooks/useToast';
import { deleteBatch, getBatchLifecycle, listBatches } from '../api/batches';
import { getBillingSummary } from '../api/billing';
import { listFields } from '../api/fields';
import { createTraceGenerationRequestKey, generateCodes, listCodes, type TraceCode } from '../api/trace';
import { downloadCSV } from '../utils/csv';
import BatchCredentialModal from './BatchCredentialModal';
import { buildBatchComplianceReport, buildBatchTraceReportRows, toBatchExportRows, toViewBatch, type BatchComplianceReport } from './BatchAdmin.model';
import { BatchCommandBar } from './batch-admin/BatchCommandBar';
import { BatchTable } from './batch-admin/BatchTable';
import { BatchLifecycleDialog } from './batch-admin/BatchLifecycleDialog';
import { BatchCodesDialog } from './batch-admin/BatchCodesDialog';
import { BatchLabelWorkspace } from './batch-admin/BatchLabelWorkspace';
import { BatchDeleteDialog, type DeleteTarget } from './batch-admin/BatchDeleteDialog';
import { CreateBatchModal } from './batch-admin/CreateBatchModal';
import { BatchAnalysisDialogs, type PendingAction } from './batch-admin/BatchAnalysisDialogs';
import { useBatchAdminFilters } from './batch-admin/useBatchAdminFilters';
import { buildIdentityMap } from '../ui/identity';

export interface BatchAdminProps {
  billingAvailable?: boolean;
  onOpenBilling?: () => void;
}

// 生成真实溯源码 · 导出溯源报告 · 数据来源于批次、农事记录、溯源事件与扫码统计接口
export default function BatchAdmin({ billingAvailable = false, onOpenBilling = () => undefined }: BatchAdminProps) {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches, { cacheKey: 'batches' });
  const { data: fields } = useApi(listFields, { cacheKey: 'fields' });
  const billing = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
  const fieldNames = useMemo(
    () => buildIdentityMap(fields ?? [], field => field.id, field => field.name),
    [fields],
  );
  const batches = useMemo(
    () => (rawBatches ?? []).map(batch => toViewBatch(batch, fieldNames)),
    [rawBatches, fieldNames],
  );
  const filters = useBatchAdminFilters(batches);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isExportingReport, setIsExportingReport] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Awaited<ReturnType<typeof getBatchLifecycle>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [codesBatchId, setCodesBatchId] = useState<string | null>(null);
  const [codesList, setCodesList] = useState<TraceCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [labelBatchId, setLabelBatchId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const generationRequestKeys = useRef<Record<string, string>>({});
  const [credentialBatch, setCredentialBatch] = useState<{ id: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profitBatchId, setProfitBatchId] = useState<string | null>(null);
  const [complianceBatchId, setComplianceBatchId] = useState<string | null>(null);
  const [complianceData, setComplianceData] = useState<BatchComplianceReport | null>(null);
  const [scanningCompliance, setScanningCompliance] = useState(false);

  const requestConfirmation = (action: PendingAction) => setPendingAction({
    ...action,
    onConfirm: async () => {
      try { await action.onConfirm(); } finally { setPendingAction(null); }
    },
  });

  const handleExport = (format: 'pdf' | 'excel') => {
    setExportDropdownOpen(false);
    const targets = selectedIds.size ? batches.filter(batch => selectedIds.has(batch.id)) : batches;
    requestConfirmation({
      type: 'export', title: `导出批次数据 (${format.toUpperCase()})`, affectedCount: targets.length, format,
      description: selectedIds.size ? `即将导出已选中的 ${targets.length} 个批次数据。` : `即将导出全部 ${targets.length} 个批次数据。`,
      onConfirm: () => {
        setIsExporting(format);
        try {
          if (format === 'excel') {
            const header = ['批次号', '品种', '种植日期', '地块', '归属商户', '状态', '已签发码数', '累计扫码', '投入成本', '人工成本', '售价', '毛利率'];
            downloadCSV(`批次数据报表_${new Date().toISOString().split('T')[0]}.csv`, [header, ...toBatchExportRows(targets)]);
            showToast(`已导出 ${targets.length} 个批次的 Excel 数据报表`);
          } else window.print();
        } finally { setIsExporting(null); }
      },
    });
  };

  const handleExportBatchReport = (id: string) => {
    const batch = batches.find(item => item.id === id);
    requestConfirmation({
      type: 'report', title: `导出溯源报告: ${batch?.code ?? id}`, affectedCount: 1, batchId: id,
      description: '数据来源于批次、农事记录、溯源事件与扫码统计接口,将导出为 CSV 文件。',
      onConfirm: async () => {
        setIsExportingReport(id);
        try {
          const lifecycle = await getBatchLifecycle(id);
          downloadCSV(`溯源报告_${batch?.code ?? id}.csv`, buildBatchTraceReportRows(batch, id, lifecycle));
          showToast(`批次 ${batch?.code ?? id} 的溯源报告已生成并下载`);
        } catch (cause) { showToast(cause instanceof Error ? `生成报告失败:${cause.message}` : '生成报告失败'); }
        finally { setIsExportingReport(null); }
      },
    });
  };

  const openDetail = async (id: string) => {
    setDetailBatchId(id); setDetailData(null); setDetailLoading(true);
    try { setDetailData(await getBatchLifecycle(id)); }
    catch (cause) {
      showToast(cause instanceof Error ? `加载批次详情失败:${cause.message}` : '加载批次详情失败');
      setDetailBatchId(null);
    } finally { setDetailLoading(false); }
  };

  const openCodes = async (id: string) => {
    setCodesBatchId(id); setCodesList([]); setCodesLoading(true);
    try { setCodesList(await listCodes(id)); }
    catch (cause) {
      showToast(cause instanceof Error ? `加载溯源码失败:${cause.message}` : '加载溯源码失败');
      setCodesBatchId(null);
    } finally { setCodesLoading(false); }
  };

  const handleGenerateCodes = async (count: number): Promise<string[]> => {
    if (!labelBatchId) return [];
    const operation = `batch-label-preview:${labelBatchId}:${count}`;
    generationRequestKeys.current[operation] ??= createTraceGenerationRequestKey('batch-label-preview', labelBatchId, count);
    setGenerating(true);
    try {
      const codes = await generateCodes(labelBatchId, count, generationRequestKeys.current[operation]);
      delete generationRequestKeys.current[operation];
      void reload();
      void billing.reload();
      return codes.map(code => code.code);
    } catch (cause) {
      showToast(cause instanceof Error ? `生成真实溯源码失败:${cause.message}` : '生成真实溯源码失败');
      return [];
    } finally { setGenerating(false); }
  };

  const handleCompliance = async (id: string) => {
    setScanningCompliance(true);
    try {
      setComplianceData(buildBatchComplianceReport(await getBatchLifecycle(id)));
      setComplianceBatchId(id);
    } catch (cause) { showToast(cause instanceof Error ? `合规探针失败:${cause.message}` : '合规探针失败'); }
    finally { setScanningCompliance(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBatch(deleteTarget.id, deleteTarget.generated > 0);
      setSelectedIds(previous => { const next = new Set(previous); next.delete(deleteTarget.id); return next; });
      showToast(`批次 ${deleteTarget.label} 已删除`);
      setDeleteTarget(null); setForceConfirm(false); void reload();
    } catch (cause) { showToast(cause instanceof Error ? `删除失败:${cause.message}` : '删除失败'); }
    finally { setDeleting(false); }
  };

  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;
  const copyLink = async (code: string) => {
    try { await navigator.clipboard.writeText(traceUrl(code)); showToast('溯源链接已复制到剪贴板'); }
    catch { showToast('复制失败,请手动复制'); }
  };
  const toggleAll = (checked: boolean) => setSelectedIds(previous => {
    const next = new Set(previous);
    filters.filteredData.forEach(batch => checked ? next.add(batch.id) : next.delete(batch.id));
    return next;
  });
  const toggleOne = (id: string, checked: boolean) => setSelectedIds(previous => {
    const next = new Set(previous);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  });

  const labelBatch = batches.find(batch => batch.id === labelBatchId);
  const detailBatch = batches.find(batch => batch.id === detailBatchId);
  const codesBatch = batches.find(batch => batch.id === codesBatchId);
  const busy = generating || isExporting !== null || isExportingReport !== null;

  return <div className="relative flex flex-col overflow-visible rounded-[6px] border border-[#E1DFDD] bg-white shadow-sm">
    <BatchCommandBar
      fields={fields ?? []} {...filters} selectedCount={selectedIds.size}
      exportDropdownOpen={exportDropdownOpen} setExportDropdownOpen={setExportDropdownOpen}
      exporting={isExporting} onExport={handleExport} onCreate={() => setShowCreateModal(true)} onReload={() => void reload()}
    />
    <BatchTable
      loading={loading} error={error} filteredData={filters.filteredData} pagedData={filters.pagedData}
      selectedIds={selectedIds} page={filters.page} totalPages={filters.totalPages}
      exportingReportId={isExportingReport} scanningCompliance={scanningCompliance}
      onReload={() => void reload()} onToggleAll={toggleAll} onToggleOne={toggleOne} onPage={filters.setPage}
      onDetail={id => void openDetail(id)} onGenerate={setLabelBatchId} onCodes={id => void openCodes(id)}
      onCompliance={id => void handleCompliance(id)} onCredentials={batch => setCredentialBatch({ id: batch.id, label: batch.code })}
      onProfit={setProfitBatchId} onReport={handleExportBatchReport}
      onDelete={batch => setDeleteTarget({ id: batch.id, label: batch.code, generated: batch.generated })}
    />
    {showCreateModal && <CreateBatchModal fields={fields ?? []} onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); void reload(); }} />}
    {credentialBatch && <BatchCredentialModal batchId={credentialBatch.id} batchLabel={credentialBatch.label} onClose={() => setCredentialBatch(null)} />}
    {detailBatchId && <BatchLifecycleDialog batch={detailBatch} data={detailData} loading={detailLoading} onClose={() => setDetailBatchId(null)} />}
    {codesBatchId && <BatchCodesDialog batch={codesBatch} codes={codesList} loading={codesLoading} traceUrl={traceUrl} onCopy={code => void copyLink(code)} onClose={() => setCodesBatchId(null)} />}
    {labelBatch && (
      <BatchLabelWorkspace
        batch={labelBatch}
        codeBalance={billing.data?.codeBalance ?? null}
        billingAvailable={billingAvailable}
        generating={generating}
        onGenerate={handleGenerateCodes}
        requestConfirmation={requestConfirmation}
        onOpenBilling={onOpenBilling}
        onClose={() => setLabelBatchId(null)}
      />
    )}
    {deleteTarget && <BatchDeleteDialog target={deleteTarget} forceConfirm={forceConfirm} deleting={deleting} onForceConfirm={setForceConfirm} onClose={() => { setDeleteTarget(null); setForceConfirm(false); }} onDelete={() => void handleDelete()} />}
    <BatchAnalysisDialogs
      batches={batches} profitBatchId={profitBatchId} complianceBatchId={complianceBatchId}
      compliance={complianceData} pending={pendingAction} busy={busy}
      onCloseProfit={() => setProfitBatchId(null)} onCloseCompliance={() => setComplianceBatchId(null)} onClosePending={() => setPendingAction(null)}
    />
  </div>;
}
