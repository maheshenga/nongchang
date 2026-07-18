import { useMemo, useRef, useState } from 'react';
import type { TraceLabelPaperSize } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { showToast } from '../hooks/useToast';
import { deleteBatch, getBatchLifecycle, listBatches } from '../api/batches';
import { listFields } from '../api/fields';
import { createTraceGenerationRequestKey, generateCodes, listCodes, type TraceCode } from '../api/trace';
import { downloadCSV } from '../utils/csv';
import BatchCredentialModal from './BatchCredentialModal';
import { buildBatchComplianceReport, buildBatchTraceReportRows, toBatchExportRows, toViewBatch, type BatchComplianceReport } from './BatchAdmin.model';
import { BatchCommandBar } from './batch-admin/BatchCommandBar';
import { BatchTable } from './batch-admin/BatchTable';
import { BatchLifecycleDialog } from './batch-admin/BatchLifecycleDialog';
import { BatchCodesDialog } from './batch-admin/BatchCodesDialog';
import BatchLabelWorkspace from './batch-admin/BatchLabelWorkspace';
import { BatchLabelGenerationDialog } from './batch-admin/BatchLabelGenerationDialog';
import { BatchDeleteDialog, type DeleteTarget } from './batch-admin/BatchDeleteDialog';
import { CreateBatchModal } from './batch-admin/CreateBatchModal';
import { BatchAnalysisDialogs, type PendingAction } from './batch-admin/BatchAnalysisDialogs';
import { useBatchAdminFilters } from './batch-admin/useBatchAdminFilters';

const MAX_LABEL_EXPORT = 500;

interface LabelWorkspaceState {
  batchId: string;
  batchNo: string;
  cropName: string;
  codeIds?: string[];
  labelCount: number;
  paperSize: TraceLabelPaperSize;
  generatedCodeCount?: number;
}

// 生成真实溯源码 · 导出溯源报告 · 数据来源于批次、农事记录、溯源事件与扫码统计接口
export default function BatchAdmin() {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches, { cacheKey: 'batches' });
  const { data: fields } = useApi(listFields, { cacheKey: 'fields' });
  const batches = useMemo(() => (rawBatches ?? []).map(toViewBatch), [rawBatches]);
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
  const codesRequestId = useRef(0);
  const [labelBatchId, setLabelBatchId] = useState<string | null>(null);
  const [qrAmount, setQrAmount] = useState(100);
  const [paperSize, setPaperSize] = useState<TraceLabelPaperSize>('4x6');
  const [labelWorkspace, setLabelWorkspace] = useState<LabelWorkspaceState | null>(null);
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

  const handleExport = () => {
    setExportDropdownOpen(false);
    const targets = selectedIds.size ? batches.filter(batch => selectedIds.has(batch.id)) : batches;
    requestConfirmation({
      type: 'export', title: '导出批次数据 CSV（Excel 可打开）', affectedCount: targets.length, format: 'csv',
      description: selectedIds.size ? `即将导出已选中的 ${targets.length} 个批次数据为 CSV（Excel 可打开）。` : `即将导出全部 ${targets.length} 个批次数据为 CSV（Excel 可打开）。`,
      onConfirm: () => {
        setIsExporting('excel');
        try {
          const header = ['批次号', '品种', '种植日期', '地块', '归属商户', '状态', '已签发码数', '累计扫码', '投入成本', '人工成本', '售价', '毛利率'];
          downloadCSV(`批次数据报表_${new Date().toISOString().split('T')[0]}.csv`, [header, ...toBatchExportRows(targets)]);
          showToast(`已导出 ${targets.length} 个批次的 CSV（Excel 可打开）数据报表`);
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
    const requestId = ++codesRequestId.current;
    setCodesBatchId(id); setCodesList([]); setCodesLoading(true);
    try {
      const codes = await listCodes(id);
      if (requestId === codesRequestId.current) setCodesList(codes);
    }
    catch (cause) {
      if (requestId === codesRequestId.current) {
        showToast(cause instanceof Error ? `加载溯源码失败:${cause.message}` : '加载溯源码失败');
        setCodesBatchId(null);
      }
    } finally {
      if (requestId === codesRequestId.current) setCodesLoading(false);
    }
  };

  const requestLabelGeneration = () => {
    if (!labelBatchId || !Number.isInteger(qrAmount) || qrAmount < 1 || qrAmount > MAX_LABEL_EXPORT) return;
    const batch = batches.find((item) => item.id === labelBatchId);
    if (!batch) return;
    const operation = `batch-label:${labelBatchId}:${qrAmount}`;
    generationRequestKeys.current[operation] ??= createTraceGenerationRequestKey('batch-label', labelBatchId, qrAmount);
    requestConfirmation({
      type: 'generate',
      title: `生成溯源标签: ${batch.code}`,
      description: `将生成 ${qrAmount} 个真实溯源码，并立即生成 ${paperSize} 标签 PDF。`,
      affectedCount: qrAmount,
      batchId: labelBatchId,
      onConfirm: async () => {
        setGenerating(true);
        try {
          const codes = await generateCodes(labelBatchId, qrAmount, generationRequestKeys.current[operation]);
          if (!codes.length) {
            showToast('未生成溯源码，请重试');
            return;
          }
          delete generationRequestKeys.current[operation];
          setLabelWorkspace({
            batchId: labelBatchId,
            batchNo: batch.code,
            cropName: batch.type,
            codeIds: codes.map((code) => code.id),
            labelCount: codes.length,
            paperSize,
            generatedCodeCount: codes.length,
          });
          setLabelBatchId(null);
          void reload();
        } catch (cause) {
          showToast(cause instanceof Error ? `生成真实溯源码失败:${cause.message}` : '生成真实溯源码失败');
        } finally {
          setGenerating(false);
        }
      },
    });
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

  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${encodeURIComponent(code)}`;
  const copyLink = async (code: string) => {
    try { await navigator.clipboard.writeText(traceUrl(code)); showToast('溯源链接已复制到剪贴板'); }
    catch { showToast('复制失败,请手动复制'); }
  };
  const closeCodes = () => {
    codesRequestId.current += 1;
    setCodesBatchId(null);
    setCodesList([]);
    setCodesLoading(false);
  };

  const exportExistingCodes = (codeIds?: string[]) => {
    const batch = batches.find((item) => item.id === codesBatchId);
    if (!batch) return;
    const labelCount = codeIds?.length ?? codesList.length;
    if (labelCount < 1 || labelCount > MAX_LABEL_EXPORT) return;
    setLabelWorkspace({
      batchId: batch.id,
      batchNo: batch.code,
      cropName: batch.type,
      ...(codeIds === undefined ? {} : { codeIds }),
      labelCount,
      paperSize: 'A4',
    });
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
    {codesBatchId && <BatchCodesDialog key={codesBatchId} batch={codesBatch} codes={codesList} loading={codesLoading} maxExport={MAX_LABEL_EXPORT} traceUrl={traceUrl} onCopy={code => void copyLink(code)} onExport={exportExistingCodes} onClose={closeCodes} />}
    {labelBatch && <BatchLabelGenerationDialog batch={labelBatch} amount={qrAmount} paperSize={paperSize} generating={generating} maxLabels={MAX_LABEL_EXPORT} onAmountChange={setQrAmount} onPaperSizeChange={setPaperSize} onGenerate={requestLabelGeneration} onClose={() => { if (!generating) setLabelBatchId(null); }} />}
    {labelWorkspace && <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"><div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[6px] bg-white shadow-lg"><BatchLabelWorkspace batchId={labelWorkspace.batchId} batchNo={labelWorkspace.batchNo} cropName={labelWorkspace.cropName} codeIds={labelWorkspace.codeIds} labelCount={labelWorkspace.labelCount} generatedCodeCount={labelWorkspace.generatedCodeCount} initialPaperSize={labelWorkspace.paperSize} onClose={() => setLabelWorkspace(null)} /></div></div>}
    {deleteTarget && <BatchDeleteDialog target={deleteTarget} forceConfirm={forceConfirm} deleting={deleting} onForceConfirm={setForceConfirm} onClose={() => { setDeleteTarget(null); setForceConfirm(false); }} onDelete={() => void handleDelete()} />}
    <BatchAnalysisDialogs
      batches={batches} profitBatchId={profitBatchId} complianceBatchId={complianceBatchId}
      compliance={complianceData} pending={pendingAction} busy={busy}
      onCloseProfit={() => setProfitBatchId(null)} onCloseCompliance={() => setComplianceBatchId(null)} onClosePending={() => setPendingAction(null)}
    />
  </div>;
}
