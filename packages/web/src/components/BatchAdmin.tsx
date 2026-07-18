import { Layers, Plus, Search, Filter, TrendingUp, Calculator, X, QrCode, CheckCircle, ShieldCheck, Download, FileText, FileSpreadsheet, Loader2, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Eye, Copy, ExternalLink, ScanLine, Trash2, RefreshCw } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { showToast } from '../hooks/useToast';
import { listBatches, createBatch, getBatchLifecycle, deleteBatch } from '../api/batches';
import { listFields, type Field } from '../api/fields';
import { createTraceGenerationRequestKey, generateCodes, listCodes, type TraceCode } from '../api/trace';
import { downloadCSV } from '../utils/csv';
import BatchCredentialModal from './BatchCredentialModal';
import BatchLabelWorkspace from './batch-admin/BatchLabelWorkspace';
import { BatchStatus, type CreateBatchDto, type TraceLabelPaperSize } from '@nongchang/shared';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import {
  PAGE_SIZE,
  STATUS_LABEL,
  buildBatchComplianceReport,
  buildBatchTraceReportRows,
  calculateMargin,
  filterBatches,
  paginateBatches,
  statusTone,
  toBatchExportRows,
  toViewBatch,
  type ViewBatch,
} from './BatchAdmin.model';

type LabelWorkspaceState = {
  batchId: string;
  batchNo: string;
  cropName: string;
  codeIds?: string[];
  labelCount: number;
  paperSize: TraceLabelPaperSize;
};

const MAX_LABEL_EXPORT = 500;

export default function BatchAdmin() {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches);
  const batches: ViewBatch[] = useMemo(() => (rawBatches ?? []).map(toViewBatch), [rawBatches]);
  const { data: fields } = useApi(listFields);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterHouse, setFilterHouse] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all');

  // computed
  const filteredData = useMemo(
    () => filterBatches(batches, { searchCode, filterType, filterHouse, filterDateRange }),
    [searchCode, filterType, filterHouse, filterDateRange, batches],
  );

  // 客户端分页:数据已全量拉取,仅在前端切片。
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [searchCode, filterType, filterHouse, filterDateRange]);
  const pagedData = useMemo(
    () => paginateBatches(filteredData, page, PAGE_SIZE),
    [filteredData, page],
  );

  // 批次详情弹窗:存批次 id,打开时拉取生命周期。
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Awaited<ReturnType<typeof getBatchLifecycle>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // 已生成码列表弹窗:存批次 id,打开时拉取该批次全部溯源码。
  const [codesBatchId, setCodesBatchId] = useState<string | null>(null);
  const [codesList, setCodesList] = useState<TraceCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [selectedCodeIds, setSelectedCodeIds] = useState<Set<string>>(new Set());
  const codesRequestId = useRef(0);
  // 删除确认:存待删批次 {id, label, generated};有码时需二次强制确认。
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; generated: number } | null>(null);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showProfitModal, setShowProfitModal] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  // 资质/检测管理弹窗:存当前批次 {id, label}。
  const [credentialBatch, setCredentialBatch] = useState<{ id: string; label: string } | null>(null);
  const [qrAmount, setQrAmount] = useState<number>(100);
  const generationRequestKeys = useRef<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [paperSize, setPaperSize] = useState<TraceLabelPaperSize>('4x6');
  const [labelWorkspace, setLabelWorkspace] = useState<LabelWorkspaceState | null>(null);
  const [isScanningCompliance, setIsScanningCompliance] = useState(false);
  const [showComplianceReport, setShowComplianceReport] = useState<string | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState<string | null>(null);

  // 表头/行复选框选中的批次 id 集合;导出时若有选中则仅导出选中项,否则导出全部。
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [pendingAction, setPendingAction] = useState<{
    type: 'export' | 'generate' | 'report';
    title: string;
    description: string;
    affectedCount: number;
    format?: string;
    batchId?: string;
    onConfirm: () => void;
  } | null>(null);

  // 合规性探针:拉取批次真实生命周期数据,按四维度(农事记录/已签发码/溯源事件/扫码量)各 25 分计分。
  const [complianceData, setComplianceData] = useState<{
    score: number;
    checks: { label: string; ok: boolean }[];
  } | null>(null);

  const handleScanCompliance = async (id: string) => {
    setIsScanningCompliance(true);
    try {
      const lc = await getBatchLifecycle(id);
      setComplianceData(buildBatchComplianceReport(lc));
      setShowComplianceReport(id);
    } catch (e) {
      showToast(e instanceof Error ? `合规探针失败:${e.message}` : '合规探针失败');
    } finally {
      setIsScanningCompliance(false);
    }
  };

  // 计算批次毛利率文本,供 CSV 导出复用。

  const handleExport = () => {
    setExportDropdownOpen(false);
    const targets = selectedIds.size > 0
      ? batches.filter(b => selectedIds.has(b.id))
      : batches;
    setPendingAction({
      type: 'export',
      title: '导出批次数据 · CSV（Excel 可打开）',
      description: selectedIds.size > 0
        ? `即将把已选中的 ${targets.length} 个批次生命周期、财务与合规数据导出为 CSV（Excel 可打开）。`
        : `即将把当前系统中全部 ${targets.length} 个批次生命周期、财务与合规数据导出为 CSV（Excel 可打开）。`,
      affectedCount: targets.length,
      format: 'csv',
      onConfirm: () => {
        setPendingAction(null);
        setIsExporting('csv');
        try {
          const header = ['批次号', '品种', '种植日期', '地块', '归属商户', '状态', '已签发码数', '累计扫码', '投入成本', '人工成本', '售价', '毛利率'];
          const rows = toBatchExportRows(targets);
          downloadCSV(`批次数据报表_${new Date().toISOString().split('T')[0]}.csv`, [header, ...rows]);
          showToast(`已导出 ${targets.length} 个批次的 CSV（Excel 可打开）数据报表`);
        } finally {
          setIsExporting(null);
        }
      },
    });
  };
  const handleExportBatchReport = (id: string) => {
    const batch = batches.find(b => b.id === id);
    setPendingAction({
      type: 'report',
      title: `导出溯源报告: ${batch?.code ?? id}`,
      description: `数据来源于批次、农事记录、溯源事件与扫码统计接口,将导出为可用 Excel 打开的 CSV 文件。`,
      affectedCount: 1,
      batchId: id,
      onConfirm: async () => {
        setPendingAction(null);
        setIsExportingReport(id);
        try {
          const lc = await getBatchLifecycle(id);
          const rows = buildBatchTraceReportRows(batch, id, lc);
          downloadCSV(`溯源报告_${batch?.code ?? id}.csv`, rows);
          showToast(`批次 ${batch?.code ?? id} 的溯源报告已生成并下载`);
        } catch (e) {
          showToast(e instanceof Error ? `生成报告失败:${e.message}` : '生成报告失败');
        } finally {
          setIsExportingReport(null);
        }
      },
    });
  };


  const activeBatch = batches.find(b => b.id === showQrModal);

  // 本入口会立即把新码交给 PDF 服务，因此与单次 PDF 导出共用 500 上限。
  const qrAmountValid = Number.isInteger(qrAmount) && qrAmount >= 1 && qrAmount <= MAX_LABEL_EXPORT;

  // 消费者扫码访问的真实溯源页 URL(hash 路由 H5)。
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${encodeURIComponent(code)}`;

  // 进入排版沙盒前为批次真实生成 qrAmount 个唯一溯源码。
  const getGenerationRequestKey = (source: string, batchId: string, count: number) => {
    const operationKey = `${source}:${batchId}:${count}`;
    generationRequestKeys.current[operationKey] ??= createTraceGenerationRequestKey(source, batchId, count);
    return generationRequestKeys.current[operationKey];
  };
  const clearGenerationRequestKey = (source: string, batchId: string, count: number) => {
    delete generationRequestKeys.current[`${source}:${batchId}:${count}`];
  };

  const handleGenerateCodes = async (): Promise<TraceCode[] | null> => {
    if (!showQrModal || !activeBatch) return null;
    const batchId = showQrModal;
    const batch = activeBatch;
    setGenerating(true);
    try {
      const requestKey = getGenerationRequestKey('batch-label-preview', batchId, qrAmount);
      const codes = await generateCodes(batchId, qrAmount, requestKey);
      clearGenerationRequestKey('batch-label-preview', batchId, qrAmount);
      setLabelWorkspace({
        batchId,
        batchNo: batch.code,
        cropName: batch.type,
        codeIds: codes.map((code) => code.id),
        labelCount: codes.length,
        paperSize,
      });
      return codes;
    } catch (e) {
      showToast(e instanceof Error ? `生成真实溯源码失败:${e.message}` : '生成真实溯源码失败');
      return null;
    } finally {
      setGenerating(false);
    }
  };

  // 打开批次详情:拉取生命周期(农事记录/溯源事件/码统计/近期扫码)。
  const openDetail = async (id: string) => {
    setDetailBatchId(id);
    setDetailData(null);
    setDetailLoading(true);
    try {
      setDetailData(await getBatchLifecycle(id));
    } catch (e) {
      showToast(e instanceof Error ? `加载批次详情失败:${e.message}` : '加载批次详情失败');
      setDetailBatchId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // 打开已生成码列表:拉取该批次全部溯源码(含各自扫码次数)。
  const openCodes = async (id: string) => {
    const requestId = ++codesRequestId.current;
    setCodesBatchId(id);
    setCodesList([]);
    setSelectedCodeIds(new Set());
    setCodesLoading(true);
    try {
      const codes = await listCodes(id);
      if (requestId === codesRequestId.current) setCodesList(codes);
    } catch (e) {
      if (requestId === codesRequestId.current) {
        showToast(e instanceof Error ? `加载溯源码失败:${e.message}` : '加载溯源码失败');
        setCodesBatchId(null);
      }
    } finally {
      if (requestId === codesRequestId.current) setCodesLoading(false);
    }
  };

  const closeCodes = () => {
    codesRequestId.current += 1;
    setCodesBatchId(null);
    setCodesList([]);
    setSelectedCodeIds(new Set());
  };

  const openExistingCodeWorkspace = (codeIds?: string[]) => {
    if (!codesBatchId) return;
    const batch = batches.find((item) => item.id === codesBatchId);
    if (!batch) return;
    setLabelWorkspace({
      batchId: codesBatchId,
      batchNo: batch.code,
      cropName: batch.type,
      ...(codeIds === undefined ? {} : { codeIds }),
      labelCount: codeIds?.length ?? codesList.length,
      paperSize,
    });
  };

  // 复制溯源链接到剪贴板。
  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(traceUrl(code));
      showToast('溯源链接已复制到剪贴板');
    } catch {
      showToast('复制失败,请手动复制');
    }
  };

  // 删除批次:有码批次需 force=true 强制删除;成功后刷新列表。
  const handleDeleteBatch = async () => {
    if (!deleteTarget) return;
    const force = deleteTarget.generated > 0;
    setDeleting(true);
    try {
      await deleteBatch(deleteTarget.id, force);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      showToast(`批次 ${deleteTarget.label} 已删除`);
      setDeleteTarget(null);
      setForceConfirm(false);
      void reload();
    } catch (e) {
      showToast(e instanceof Error ? `删除失败:${e.message}` : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const closeDelete = () => { setDeleteTarget(null); setForceConfirm(false); };

  return (
    <div className="relative flex flex-col overflow-visible rounded-[6px] border border-[#E1DFDD] bg-white shadow-sm">
      <div className="shrink-0 border-b border-[#E1DFDD] bg-white px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs text-[#605E5C]">首页 / 批次管理</div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-[#242424]">
              <span className="grid h-8 w-8 place-items-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
                <Layers className="h-4 w-4" />
              </span>
              批次全生命周期管理
            </h1>
            <p className="mt-1 text-sm text-[#605E5C]">管理种植、采收、包装、溯源码签发与扫码核验链路。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowCreateModal(true)} className={fluentButton('primary')}>
              <Plus className="h-4 w-4" />
              新建批次
            </button>
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                disabled={isExporting !== null}
                className={fluentButton('secondary')}
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isExporting ? `正在导出 ${isExporting.toUpperCase()}...` : selectedIds.size > 0 ? `导出 (${selectedIds.size})` : '导出'}
              </button>
              {exportDropdownOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-[4px] border border-[#E1DFDD] bg-white shadow-lg">
                  <button onClick={handleExport} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#242424] hover:bg-[#F3F2F1]">
                    <FileSpreadsheet className="h-4 w-4 text-[#107C10]" /> CSV（Excel 可打开）
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setShowAdvancedFilter(!showAdvancedFilter)} className={fluentButton('secondary')}>
              <Filter className="h-4 w-4" />
              筛选
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedFilter ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => void reload()} className={fluentButton('subtle')}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
            <input
              type="text"
              placeholder="按批次号搜索"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className={`${fluentInput} w-full pl-8`}
            />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={`${fluentSelect} w-full max-w-[180px]`}>
            <option value="all">全部品种</option>
            <option value="阳光玫瑰">阳光玫瑰</option>
            <option value="美早">美早</option>
            <option value="芍药">芍药</option>
          </select>
          <select value={filterHouse} onChange={(e) => setFilterHouse(e.target.value)} className={`${fluentSelect} w-full max-w-[180px]`}>
            <option value="all">全部地块</option>
            {(fields ?? []).slice(0, 6).map((field: Field) => (
              <option key={field.id} value={field.id.slice(0, 8)}>{field.name}</option>
            ))}
          </select>
          <select value={filterDateRange} onChange={(e) => setFilterDateRange(e.target.value)} className={`${fluentSelect} w-full max-w-[180px]`}>
            <option value="all">全部日期</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {loading && <div className="p-8 text-center text-sm text-[#605E5C]">加载中...</div>}
        {error && (
          <div className="p-8 text-center text-sm text-[#A4262C]">
            {error} <button onClick={() => void reload()} className="ml-2 font-semibold underline">重试</button>
          </div>
        )}
        <div className={fluentTable.wrapper}>
          <table className={fluentTable.table}>
            <thead className={fluentTable.thead}>
              <tr>
                <th className={`${fluentTable.th} w-12`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#0078D4]"
                    checked={filteredData.length > 0 && filteredData.every(b => selectedIds.has(b.id))}
                    ref={el => { if (el) el.indeterminate = filteredData.some(b => selectedIds.has(b.id)) && !filteredData.every(b => selectedIds.has(b.id)); }}
                    onChange={(e) => {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) filteredData.forEach(b => next.add(b.id));
                        else filteredData.forEach(b => next.delete(b.id));
                        return next;
                      });
                    }}
                  />
                </th>
                <th className={fluentTable.th}>批次号</th>
                <th className={fluentTable.th}>品种</th>
                <th className={fluentTable.th}>地块</th>
                <th className={fluentTable.th}>状态</th>
                <th className={`${fluentTable.th} text-right`}>签发码数</th>
                <th className={`${fluentTable.th} text-right`}>扫码量</th>
                <th className={fluentTable.th}>最近更新</th>
                <th className={`${fluentTable.th} text-right`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedData.map((b) => (
                <tr key={b.id} className={`${fluentTable.row} ${selectedIds.has(b.id) ? fluentTable.rowSelected : ''}`}>
                  <td className={fluentTable.td}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0078D4]"
                      checked={selectedIds.has(b.id)}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(b.id);
                          else next.delete(b.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className={`${fluentTable.td} font-mono font-semibold`}>{b.code}</td>
                  <td className={fluentTable.td}>{b.type}</td>
                  <td className={fluentTable.td}>{b.house}</td>
                  <td className={fluentTable.td}>
                    <span className={fluentStatusTag(statusTone(b.stage))}>{STATUS_LABEL[b.stage] ?? b.stage}</span>
                  </td>
                  <td className={`${fluentTable.td} text-right font-mono`}>{b.generated.toLocaleString('zh-CN')}</td>
                  <td className={`${fluentTable.td} text-right font-mono`}>{b.scanTotal.toLocaleString('zh-CN')}</td>
                  <td className={fluentTable.td}>{b.date}</td>
                  <td className={`${fluentTable.td} text-right`}>
                    <div className="flex max-w-[520px] flex-wrap justify-end gap-1">
                      <button onClick={() => openDetail(b.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                        <Eye className="h-3.5 w-3.5" />
                        查看
                      </button>
                      <button onClick={() => setShowQrModal(b.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                        <QrCode className="h-3.5 w-3.5" />
                        生码
                      </button>
                      <button onClick={() => openCodes(b.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                        <ScanLine className="h-3.5 w-3.5" />
                        已生成码
                      </button>
                      <button onClick={() => handleScanCompliance(b.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                        {isScanningCompliance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        合规
                      </button>
                      <button onClick={() => setCredentialBatch({ id: b.id, label: b.code })} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        资质
                      </button>
                      <button onClick={() => setShowProfitModal(b.id)} className={`${fluentButton('subtle')} whitespace-nowrap`}>
                        <Calculator className="h-3.5 w-3.5" />
                        利润
                      </button>
                      <button
                        onClick={() => handleExportBatchReport(b.id)}
                        disabled={isExportingReport === b.id}
                        className={`${fluentButton('subtle')} whitespace-nowrap`}
                      >
                        {isExportingReport === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                        报告
                      </button>
                      <button onClick={() => setDeleteTarget({ id: b.id, label: b.code, generated: b.generated })} className={`${fluentButton('subtle')} whitespace-nowrap text-[#A4262C]`}>
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredData.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-[#605E5C]">暂无符合条件的批次</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div hidden aria-hidden="true" className="p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between bg-slate-50/50 shrink-0 gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
            <div className="p-2 bg-[#DFF6DD] text-[#107C10] rounded-lg shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            芍药繁育批次与全生命周期管理
          </h3>
          <p className="text-xs text-slate-500 mt-1.5 tracking-wide">独立管控各类芍药的组培、出圃及流转批次，追溯并自动合演农事数据</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              disabled={isExporting !== null}
              className={`flex items-center gap-2 border bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-[6px] text-sm font-bold transition-all shadow-sm ${isExporting ? 'opacity-50 cursor-not-allowed border-slate-200' : 'border-slate-200'} focus:ring-4 focus:ring-slate-100`}
            >
              {isExporting ? <Loader2 className="w-4 h-4 text-[#107C10] animate-spin" /> : <Download className="w-4 h-4 text-slate-500" />}
              {isExporting ? `正在安全生成 ${isExporting.toUpperCase()}...` : selectedIds.size > 0 ? `数据报表下发 (已选 ${selectedIds.size})` : '数据报表下发'}
            </button>
            {exportDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-[6px] shadow-lg overflow-hidden z-20 animate-in fade-in slide-in-from-top-2">
                <button onClick={handleExport} className="w-full text-left px-5 py-3 text-sm font-bold text-slate-700 hover:bg-[#F3F2F1] hover:text-[#107C10] flex items-center gap-3 transition-colors">
                  <div className="bg-[#DFF6DD] text-[#107C10] p-1.5 rounded-md"><FileSpreadsheet className="w-4 h-4" /></div> CSV（Excel 可打开）
                </button>
              </div>
            )}
          </div>
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="检索专属批次号序列..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4]/20 focus:border-[#107C10] text-slate-700 shadow-sm w-full transition-all"
            />
          </div>
          <button 
            onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
            className={`flex items-center gap-2 border px-4 py-2.5 rounded-[6px] text-sm font-bold transition-all shadow-sm ${showAdvancedFilter ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}
          >
            <Filter className={`w-4 h-4 ${showAdvancedFilter ? 'text-slate-300' : 'text-slate-500'}`} />
            高级筛选过滤
            <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${showAdvancedFilter ? 'rotate-180 text-slate-400' : 'text-slate-400'}`} />
          </button>
          <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-[#0078D4] hover:bg-[#106EBE] text-white px-6 py-2.5 rounded-[6px] text-sm font-bold transition-all shadow-sm shadow-none focus:ring-4 focus:ring-[#0078D4]/30">
            <Plus className="w-4 h-4" />
            新建管理批次
          </button>
        </div>
      </div>
      
      {showAdvancedFilter && (
        <div className="shrink-0 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
          <div className="mb-3 text-xs font-semibold text-[#605E5C]">高级筛选</div>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#605E5C] md:w-48">
              品种
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={`${fluentSelect} w-full`}>
                <option value="all">全部品种</option>
                <option value="阳光玫瑰">阳光玫瑰</option>
                <option value="美早">美早</option>
                <option value="芍药">芍药</option>
              </select>
            </label>
            <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#605E5C] md:w-56">
              地块
              <select value={filterHouse} onChange={(e) => setFilterHouse(e.target.value)} className={`${fluentSelect} w-full`}>
                <option value="all">全部地块</option>
                {(fields ?? []).slice(0, 6).map((field: Field) => (
                  <option key={field.id} value={field.id.slice(0, 8)}>{field.name}</option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#605E5C] md:w-48">
              日期
              <select value={filterDateRange} onChange={(e) => setFilterDateRange(e.target.value)} className={`${fluentSelect} w-full`}>
                <option value="all">全部日期</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setSearchCode('');
                setFilterType('all');
                setFilterHouse('all');
                setFilterDateRange('all');
              }}
              className={fluentButton('secondary')}
            >
              清空筛选
            </button>
          </div>
        </div>
      )}

      <div hidden aria-hidden="true" className="p-0 bg-slate-50/30">
        {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
        {error && (
          <div className="p-8 text-center text-rose-500 text-sm">
            {error} <button onClick={() => void reload()} className="ml-2 underline font-bold">重试</button>
          </div>
        )}
        <table className="w-full text-left whitespace-nowrap">
          <thead className="text-[10px] text-slate-500 uppercase tracking-widest bg-slate-100/80 sticky top-0 border-b border-slate-200 z-10 backdrop-blur-sm">
            <tr>
              <th className="px-6 py-4 font-bold border-l-2 border-transparent w-12">
                 <input
                   type="checkbox"
                   className="rounded text-[#107C10] border-slate-300 focus:ring-[#0078D4]"
                   checked={filteredData.length > 0 && filteredData.every(b => selectedIds.has(b.id))}
                   ref={el => { if (el) el.indeterminate = filteredData.some(b => selectedIds.has(b.id)) && !filteredData.every(b => selectedIds.has(b.id)); }}
                   onChange={(e) => {
                     setSelectedIds(prev => {
                       const next = new Set(prev);
                       if (e.target.checked) filteredData.forEach(b => next.add(b.id));
                       else filteredData.forEach(b => next.delete(b.id));
                       return next;
                     });
                   }}
                 />
              </th>
              <th className="px-6 py-4 font-bold">繁育序列及批次号</th>
              <th className="px-6 py-4 font-bold">关联名贵珍品系</th>
              <th className="px-6 py-4 font-bold">创设时间档</th>
              <th className="px-6 py-4 font-bold">繁育基站/温室环境</th>
              <th className="px-6 py-4 font-bold">归属商户</th>
              <th className="px-6 py-4 font-bold text-right">已签发防伪总数</th>
              <th className="px-6 py-4 font-bold">生长阶段监控</th>
              <th className="px-6 py-4 font-bold text-right">安全流转管理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            {pagedData.map((b) => (
              <tr
                 key={b.id}
                 className="hover:bg-[#F3F2F1]/20 transition-colors group"
              >
                <td className="px-6 py-4 border-l-2 border-transparent group-hover:border-[#0078D4]">
                    <input
                      type="checkbox"
                      className="rounded text-[#107C10] border-slate-300 focus:ring-[#0078D4]"
                      checked={selectedIds.has(b.id)}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(b.id);
                          else next.delete(b.id);
                          return next;
                        });
                      }}
                    />
                </td>
                <td className="px-6 py-4 font-mono font-bold text-slate-700 text-sm tracking-wide" title={b.code}>{b.code.slice(0, 5)}</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full hidden sm:block bg-slate-300 group-hover:bg-[#0078D4] transition-colors"></div>
                     {b.type}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs font-mono">{b.date}</td>
                <td className="px-6 py-4 text-slate-600 font-medium text-sm">{b.house}</td>
                <td className="px-6 py-4 text-slate-700 font-bold text-sm">{b.owner}</td>
                <td className="px-6 py-4 font-mono font-black text-[#107C10] text-right text-base">{b.generated} <span className="text-xs text-slate-400 font-normal">张</span></td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 bg-${b.color}-50 text-${b.color}-700 border border-${b.color}-200/60 rounded-md text-xs font-bold inline-flex items-center gap-1.5 shadow-sm`}>
                    <span className={`w-1.5 h-1.5 rounded-full bg-${b.color}-500 flex-shrink-0 animate-pulse`}></span>
                    {STATUS_LABEL[b.stage] ?? b.stage}
                  </span>
                </td>
                <td className="px-6 py-4 opacity-80 group-hover:opacity-100 transition-opacity">
                  <div className="grid grid-cols-4 gap-2 w-[440px] ml-auto">
                  <button
                    onClick={() => openDetail(b.id)}
                    className="flex items-center justify-center gap-1.5 text-slate-600 hover:text-white hover:bg-slate-700 font-bold text-[10px] uppercase tracking-wider bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    <Eye className="w-3 h-3" />
                    批次详情
                  </button>
                  <button
                    onClick={() => setShowQrModal(b.id)}
                    className="flex items-center justify-center gap-1.5 text-blue-600 hover:text-white hover:bg-blue-600 font-bold text-[10px] uppercase tracking-wider bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg transition-all shadow-sm group/btn"
                  >
                    <QrCode className="w-3 h-3 group-hover/btn:scale-110 transition-transform" />
                    生码溯源
                  </button>
                  <button
                    onClick={() => openCodes(b.id)}
                    className="flex items-center justify-center gap-1.5 text-violet-600 hover:text-white hover:bg-violet-600 font-bold text-[10px] uppercase tracking-wider bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    <ScanLine className="w-3 h-3" />
                    已生成码
                  </button>
                  <button
                    onClick={() => handleScanCompliance(b.id)}
                    className="flex items-center justify-center gap-1.5 text-[#107C10] hover:text-white hover:bg-[#106EBE] font-bold text-[10px] uppercase tracking-wider bg-[#DFF6DD] border border-[#E1DFDD] px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    {isScanningCompliance ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                    合规性探针
                  </button>
                  <button
                    onClick={() => setCredentialBatch({ id: b.id, label: b.code })}
                    className="flex items-center justify-center gap-1.5 text-teal-600 hover:text-white hover:bg-teal-600 font-bold text-[10px] uppercase tracking-wider bg-teal-50 border border-teal-100 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    资质 / 检测
                  </button>
                  <button
                    onClick={() => setShowProfitModal(b.id)}
                    className="flex items-center justify-center gap-1.5 text-amber-600 hover:text-white hover:bg-amber-600 font-bold text-[10px] uppercase tracking-wider bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    <Calculator className="w-3 h-3" />
                    利润大盘
                  </button>
                  <button
                    onClick={() => handleExportBatchReport(b.id)}
                    disabled={isExportingReport === b.id}
                    className="flex items-center justify-center gap-1.5 text-indigo-600 hover:text-white hover:bg-indigo-600 font-bold text-[10px] uppercase tracking-wider bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg transition-all shadow-sm disabled:opacity-50"
                  >
                    {isExportingReport === b.id ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : <FileText className="w-3 h-3" />}
                    极速出具报告
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: b.id, label: b.code, generated: b.generated })}
                    className="flex items-center justify-center gap-1.5 text-rose-600 hover:text-white hover:bg-rose-600 font-bold text-[10px] uppercase tracking-wider bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    <Trash2 className="w-3 h-3" />
                    删除批次
                  </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredData.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">暂无符合条件的批次</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页器 */}
      {filteredData.length > 0 && (
        <div className="flex shrink-0 flex-col gap-3 border-t border-[#E1DFDD] bg-white px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-[#605E5C]">
            共 <span className="font-semibold text-[#242424]">{filteredData.length}</span> 个批次，第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={fluentButton('secondary')}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> 上一页
            </button>
            {Array.from({ length: totalPages }).map((_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`h-8 min-w-8 rounded-[4px] border px-2 text-sm font-semibold transition-colors ${p === page ? 'border-[#0078D4] bg-[#0078D4] text-white' : 'border-[#C8C6C4] bg-white text-[#242424] hover:bg-[#F3F2F1]'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={fluentButton('secondary')}
            >
              下一页 <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* QR Generation Modal */}
      {showQrModal && activeBatch && !labelWorkspace && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="生成溯源标签">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[6px] border border-[#E1DFDD] bg-white shadow-lg">
            <div className="flex items-start justify-between border-b border-[#E1DFDD] px-6 py-5">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-[#242424]"><QrCode className="h-5 w-5 text-[#0078D4]" />生成溯源标签</h3>
                <p className="mt-1 text-sm text-[#605E5C]">批次 {activeBatch.code} · {activeBatch.type}</p>
              </div>
              <button type="button" onClick={() => setShowQrModal(null)} disabled={generating} aria-label="关闭生成设置" title="关闭" className={fluentButton('subtle')}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-5 px-6 py-5">
              <label className="block text-sm font-semibold text-[#323130]">
                纸张规格
                <select aria-label="纸张规格" value={paperSize} onChange={(event) => setPaperSize(event.target.value as TraceLabelPaperSize)} className={`${fluentSelect} mt-1 w-full`}>
                  <option value="4x6">4x6 英寸（单张单页）</option>
                  <option value="2x1">2x1 英寸（单张单页）</option>
                  <option value="A4">A4（每页 21 张）</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-[#323130]">
                生成数量
                <input
                  aria-label="生成数量"
                  type="number"
                  min={1}
                  max={MAX_LABEL_EXPORT}
                  value={qrAmount}
                  onChange={(event) => setQrAmount(Math.floor(Number(event.target.value)))}
                  className={`${fluentInput} mt-1 w-full`}
                />
              </label>
              {!qrAmountValid && <p className="text-sm text-[#A4262C]" role="alert">生成数量须为 1 ~ {MAX_LABEL_EXPORT} 的整数</p>}
              <div className="border border-[#E1DFDD] bg-[#FAFAFA] p-4 text-sm text-[#605E5C]">
                <p>生成会消耗 {qrAmountValid ? qrAmount : 0} 个二维码额度；随后由后端生成真实 PDF。</p>
                <p className="mt-1">PDF 预览、下载和打印使用同一文件，失败重试不会再次生成溯源码。</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E1DFDD] px-6 py-4">
              <button type="button" onClick={() => setShowQrModal(null)} disabled={generating} className={fluentButton('secondary')}>暂缓生成</button>
              <button
                type="button"
                disabled={!qrAmountValid || generating}
                onClick={() => {
                  setPendingAction({
                    type: 'generate',
                    title: '生成真实溯源码并创建标签 PDF',
                    description: `将为批次 [${activeBatch.id}] 生成 ${qrAmount} 枚唯一溯源码（纸张：${paperSize}）。生成会扣减二维码额度，PDF 重试不会重复扣减。`,
                    affectedCount: qrAmount,
                    batchId: activeBatch.id,
                    onConfirm: async () => {
                      await handleGenerateCodes();
                      setPendingAction(null);
                    },
                  });
                }}
                className={fluentButton('primary')}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                生成真实溯源码
              </button>
            </div>
          </div>
        </div>
      )}

      {labelWorkspace && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="溯源标签 PDF">
          <div className="mx-auto w-full max-w-6xl bg-white shadow-lg">
            <p className="border-b border-[#E1DFDD] bg-[#FFF4CE] px-4 py-3 text-sm text-[#323130]">
              溯源码已生成；若标签文件生成失败，请直接在下方重试 PDF，不会再次生成溯源码。
            </p>
            <BatchLabelWorkspace
              batchId={labelWorkspace.batchId}
              batchNo={labelWorkspace.batchNo}
              cropName={labelWorkspace.cropName}
              codeIds={labelWorkspace.codeIds}
              labelCount={labelWorkspace.labelCount}
              initialPaperSize={labelWorkspace.paperSize}
              onClose={() => setLabelWorkspace(null)}
            />
          </div>
        </div>
      )}

      {/* Profit Analysis Plugin Modal */}
      {/* Compliance Scan Report Modal */}
      {showComplianceReport && (
         <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="合规探针">
            <div className="bg-white rounded-[6px] shadow-lg w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="flex justify-between items-center bg-[#EFF6FC] p-6 border-b border-[#E1DFDD] relative overflow-hidden">
                  <ShieldCheck className="absolute -left-4 -bottom-4 w-24 h-24 text-[#107C10]/10 -rotate-12" />
                  <h3 className="font-bold text-[#107C10] text-lg flex items-center gap-3 relative z-10">
                     <div className="p-2 bg-[#DFF6DD] rounded-lg shadow-sm">
                       <ShieldCheck className="w-5 h-5 text-[#107C10]" />
                     </div>
                     溯源法定合规性自动化探针
                  </h3>
                  <button onClick={() => setShowComplianceReport(null)} className="text-[#107C10] hover:text-[#107C10] hover:bg-[#F3F2F1] p-2 rounded-lg transition-colors relative z-10"><X className="w-5 h-5" /></button>
               </div>
               <div className="p-8">
                  <div className="flex items-center gap-6 mb-8 bg-slate-50 p-5 rounded-[6px] border border-slate-100 shadow-inner">
                     <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 border-white shadow-md relative shrink-0 ${(complianceData?.score ?? 0) >= 75 ? 'bg-[#DFF6DD] text-[#107C10]' : (complianceData?.score ?? 0) >= 50 ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                        <div className={`absolute inset-0 border-4 rounded-full opacity-20 animate-ping ${(complianceData?.score ?? 0) >= 75 ? 'border-[#107C10]' : (complianceData?.score ?? 0) >= 50 ? 'border-amber-500' : 'border-rose-500'}`}></div>
                        <span className="text-2xl font-black">{complianceData?.score ?? 0}<span className="text-sm">%</span></span>
                     </div>
                     <div>
                        <div className="text-base font-black text-slate-800 mb-1.5 flex items-center gap-2">
                          {(complianceData?.score ?? 0) >= 75
                            ? '接近完全符合法定花卉安全溯源配置规范'
                            : (complianceData?.score ?? 0) >= 50
                            ? '基本符合,仍有关键溯源要素待补齐'
                            : '溯源配置严重不足,需尽快补全'}
                          {(complianceData?.score ?? 0) >= 75 && <CheckCircle className="w-4 h-4 text-[#107C10]" />}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">当前挂载抽检批次号流水: <span className="font-mono font-bold bg-white text-slate-700 px-2 py-0.5 rounded shadow-sm border border-slate-200 ml-1">{showComplianceReport}</span></div>
                     </div>
                  </div>

                  <div className="space-y-3 relative before:absolute before:inset-y-4 before:left-[1.375rem] before:w-0.5 before:bg-slate-100">
                     {(complianceData?.checks ?? []).map((c, i) => (
                       c.ok ? (
                         <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-[6px] relative z-10 shadow-sm hover:border-[#C8C6C4] transition-colors">
                            <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                               <div className="w-6 h-6 rounded-full bg-[#DFF6DD] flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-[#C8C6C4]">
                                 <CheckCircle className="w-3.5 h-3.5 text-[#107C10]" />
                               </div>
                               {c.label}
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-[#107C10] font-bold bg-[#DFF6DD] px-2 py-1 rounded">已挂载</span>
                         </div>
                       ) : (
                         <div key={i} className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-[6px] relative z-10 shadow-sm shadow-amber-100/50 overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                            <div className="flex items-center gap-3 text-sm text-amber-900 font-black">
                               <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-amber-200">
                                 <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                               </div>
                               待补充:{c.label}
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-amber-700 font-bold bg-amber-100 px-2 py-1 rounded">未达标</span>
                         </div>
                       )
                     ))}
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                     <button onClick={() => setShowComplianceReport(null)} className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-[6px] font-bold text-sm transition-all shadow-lg shadow-slate-900/20 active:scale-95">关联合规探针工作台</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {showProfitModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="删除确认">
           <div className="bg-white rounded-[6px] shadow-lg w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-purple-100/50">
              <div className="p-6 border-b border-purple-100/50 bg-[#EFF6FC] flex items-center justify-between relative overflow-hidden">
                 <TrendingUp className="absolute -right-4 -top-4 w-32 h-32 text-purple-500/5 rotate-12" />
                 {(() => {
                    const batch = batches.find(b => b.id === showProfitModal);
                    return (
                      <>
                        <h3 className="font-bold text-purple-900 text-lg flex items-center gap-3 relative z-10">
                          <div className="p-2 bg-purple-100/80 rounded-lg shadow-sm">
                            <TrendingUp className="w-5 h-5 text-purple-600" />
                          </div>
                          单批次高级利润率推演沙盘
                          <span className="text-xs font-mono font-bold bg-white text-purple-700 px-2 py-0.5 rounded ml-2 shadow-sm border border-purple-100">{batch?.id}</span>
                        </h3>
                        <button onClick={() => setShowProfitModal(null)} className="text-purple-400 hover:text-purple-700 hover:bg-purple-100/50 p-2 rounded-lg transition-colors relative z-10">
                          <X className="w-5 h-5" />
                        </button>
                      </>
                    )
                 })()}
              </div>
              <div className="p-8 space-y-6">
                 {(() => {
                    const batch = batches.find(b => b.id === showProfitModal);
                    if (!batch) return null;
                    const res = calculateMargin(batch.inputCost, batch.laborCost, batch.sellPrice);
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="bg-slate-50 border border-slate-100 p-5 rounded-[6px] shadow-inner relative overflow-hidden border-t-[3px] border-t-amber-400">
                             <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">公允投入品总计结转成本 (沉没)</div>
                             <div className="text-xl font-black text-slate-800 font-mono tracking-tight"><span className="text-slate-400 font-sans mr-1">¥</span>{batch.inputCost.toLocaleString()}</div>
                           </div>
                           <div className="bg-slate-50 border border-slate-100 p-5 rounded-[6px] shadow-inner relative overflow-hidden border-t-[3px] border-t-amber-500">
                             <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">全时段人工及地租分摊成本比率</div>
                             <div className="text-xl font-black text-slate-800 font-mono tracking-tight"><span className="text-slate-400 font-sans mr-1">¥</span>{batch.laborCost.toLocaleString()}</div>
                           </div>
                        </div>
                        <div className="bg-[#EFF6FC] border border-purple-200/60 p-6 rounded-[6px] flex items-center justify-between shadow-sm relative overflow-hidden">
                           <div className="relative z-10">
                             <div className="text-[10px] uppercase tracking-widest font-bold text-indigo-900 mb-1 flex items-center gap-1.5">
                               {batch.sellPrice > 0 ? (
                                 <><CheckCircle className="w-3.5 h-3.5 text-[#107C10]" /> 已锁定分销合同总出圃成交额</>
                               ) : (
                                 <><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> 沙盘预估市场终端公允成交规模</>
                               )}
                             </div>
                             <div className="text-4xl font-black text-[#5B2E91] font-mono tracking-tighter"><span className="text-purple-400 text-2xl font-sans mr-1">¥</span>{res.expectedSell.toLocaleString()}</div>
                           </div>
                           <div className="text-right relative z-10 pl-6 border-l border-purple-200/50">
                             <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">模型重估毛利率动态指标</div>
                             <div className="text-4xl font-black text-[#107C10] tracking-tighter drop-shadow-sm">{res.text}</div>
                           </div>
                        </div>
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-4 rounded-[6px] border border-slate-100 flex items-start gap-3 leading-relaxed shadow-sm">
                           <div className="bg-white p-1.5 rounded-lg border border-slate-200 mt-0.5 shrink-0">
                             <Calculator className="w-3.5 h-3.5 text-slate-400" />
                           </div>
                           <p>该插件根据《农林牧渔产品成本核算准则》实时挂钩集团财务与大棚实仓数据基石。模型底层已扣除预期植被生长期自然损耗率(3.5%)、坏死率以及相关智能设施的固定资产折旧公摊金额。</p>
                        </div>
                      </>
                    )
                 })()}
              </div>
           </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-[6px] shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-start gap-4">
                 <div className={`p-3 rounded-full shrink-0 ${pendingAction.type === 'export' ? 'bg-indigo-100 text-indigo-600' : pendingAction.type === 'report' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                    <AlertTriangle className="w-6 h-6" />
                 </div>
                 <div>
                    <h3 className="font-black text-slate-800 text-lg mb-1">{pendingAction.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium pb-2 border-b border-slate-200">{pendingAction.description}</p>
                    <div className="mt-4 flex flex-col gap-2">
                       <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-bold">影响批次范围</span>
                          <span className="font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">{pendingAction.affectedCount} 个</span>
                       </div>
                       {pendingAction.format && (
                          <div className="flex justify-between items-center text-xs">
                             <span className="text-slate-500 font-bold">输出格式配置</span>
                             <span className="font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold">{pendingAction.format.toUpperCase()}</span>
                          </div>
                       )}
                       {pendingAction.batchId && (
                          <div className="flex justify-between items-center text-xs mt-1">
                             <span className="text-slate-500 font-bold">目标批次编号</span>
                             <span className="font-mono bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">{pendingAction.batchId}</span>
                          </div>
                       )}
                    </div>
                 </div>
              </div>
              <div className="p-5 flex justify-end gap-3 bg-white">
                  <button
                    onClick={() => setPendingAction(null)}
                    disabled={generating}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    取消
                  </button>
                 <button
                    onClick={() => pendingAction.onConfirm()}
                    disabled={generating || isExporting !== null || isExportingReport !== null}
                    className={`px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-50 ${pendingAction.type === 'export' ? 'bg-indigo-600 hover:bg-indigo-700' : pendingAction.type === 'report' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                 >
                    {generating ? '生成中…' : `确认 ${pendingAction.type === 'generate' ? '生成' : '导出'}`}
                 </button>
              </div>
           </div>
        </div>
      )}

      {showCreateModal && (
        <CreateBatchModal
          fields={fields ?? []}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); void reload(); }}
        />
      )}

      {credentialBatch && (
        <BatchCredentialModal
          batchId={credentialBatch.id}
          batchLabel={credentialBatch.label}
          onClose={() => setCredentialBatch(null)}
        />
      )}

      {/* 批次详情弹窗 */}
      {detailBatchId && (() => {
        const b = batches.find(x => x.id === detailBatchId);
        const recs = (detailData?.farmRecords ?? []) as Array<Record<string, unknown>>;
        const evts = (detailData?.traceEvents ?? []) as Array<Record<string, unknown>>;
        const scans = (detailData?.recentScans ?? []) as Array<Record<string, unknown>>;
        return (
          <div className="absolute inset-0 z-[75] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[6px] shadow-lg w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                  <div className="p-2 bg-slate-200 text-slate-700 rounded-lg shadow-sm"><Eye className="w-5 h-5" /></div>
                  批次详情 · <span className="font-mono text-slate-600">{b?.code}</span>
                  {b && <span className={`px-2 py-0.5 rounded-md text-xs font-bold bg-${b.color}-50 text-${b.color}-700 border border-${b.color}-200/60`}>{STATUS_LABEL[b.stage] ?? b.stage}</span>}
                </h3>
                <button onClick={() => setDetailBatchId(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {detailLoading && <div className="py-12 text-center text-slate-400 text-sm">加载中…</div>}
                {!detailLoading && detailData && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-[6px] p-4"><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">品种</div><div className="text-sm font-black text-slate-800">{b?.type}</div></div>
                      <div className="bg-slate-50 border border-slate-100 rounded-[6px] p-4"><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">种植日期</div><div className="text-sm font-black text-slate-800 font-mono">{b?.date}</div></div>
                      <div className="bg-[#DFF6DD] border border-[#E1DFDD] rounded-[6px] p-4"><div className="text-[10px] text-[#107C10] font-bold uppercase tracking-widest mb-1">已签发码数</div><div className="text-sm font-black text-[#107C10] font-mono">{detailData.codeCount ?? 0}</div></div>
                      <div className="bg-blue-50 border border-blue-100 rounded-[6px] p-4"><div className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mb-1">累计扫码</div><div className="text-sm font-black text-blue-700 font-mono">{detailData.scanTotal ?? 0}</div></div>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">农事记录 ({recs.length})</h4>
                      {recs.length === 0 ? <p className="text-xs text-slate-400">暂无农事记录</p> : (
                        <div className="space-y-2">
                          {recs.map((r, i) => (
                            <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-4 py-2.5 text-sm shadow-sm">
                              <span className="font-mono text-xs text-slate-400 shrink-0">{r.recordedAt ? String(r.recordedAt).slice(0, 10) : ''}</span>
                              <span className="font-bold text-slate-700">{String(r.action ?? '')}</span>
                              <span className="text-slate-500 text-xs truncate">{String(r.note ?? '')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">溯源链路事件 ({evts.length})</h4>
                      {evts.length === 0 ? <p className="text-xs text-slate-400">暂无溯源事件</p> : (
                        <div className="space-y-2">
                          {evts.map((e, i) => (
                            <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-4 py-2.5 text-sm shadow-sm">
                              <span className="font-mono text-xs text-slate-400 shrink-0">{e.occurredAt ? String(e.occurredAt).slice(0, 10) : ''}</span>
                              <span className="font-bold text-slate-700">{String(e.eventType ?? '')}</span>
                              <span className="text-slate-500 text-xs truncate">{String(e.description ?? '')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">近期扫码 ({scans.length})</h4>
                      {scans.length === 0 ? <p className="text-xs text-slate-400">暂无扫码记录</p> : (
                        <div className="flex flex-wrap gap-2">
                          {scans.map((s, i) => (
                            <span key={i} className="font-mono text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200">{s.scannedAt ? String(s.scannedAt).slice(0, 16).replace('T', ' ') : ''}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 已生成码列表弹窗 */}
      {codesBatchId && (() => {
        const b = batches.find(x => x.id === codesBatchId);
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="已生成溯源码">
            <div className="flex max-h-[calc(100vh-1rem)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-[6px] bg-white shadow-lg animate-in zoom-in-95 duration-200 sm:max-h-[85vh]">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-violet-50 p-4 sm:p-6">
                <h3 className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-lg font-bold text-violet-900">
                  <div className="shrink-0 rounded-lg bg-violet-200 p-2 text-violet-700 shadow-sm"><ScanLine className="h-5 w-5" /></div>
                  已生成溯源码 · <span className="min-w-0 max-w-full break-all font-mono text-violet-700">{b?.code}</span>
                  <span className="shrink-0 rounded border border-violet-200 bg-white px-2 py-0.5 font-mono text-xs text-violet-600">{codesList.length} 个</span>
                </h3>
                <button onClick={closeCodes} aria-label="关闭已生成码" title="关闭" className="shrink-0 rounded-lg p-2 text-violet-400 transition-colors hover:bg-violet-100 hover:text-violet-700"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-b border-[#E1DFDD] px-6 py-3 text-sm">
                <span className="mr-auto font-semibold text-[#323130]">已选择 {selectedCodeIds.size} / {MAX_LABEL_EXPORT}</span>
                <button
                  type="button"
                  disabled={codesList.length === 0 || codesList.length > MAX_LABEL_EXPORT}
                  onClick={() => setSelectedCodeIds(new Set(codesList.map((code) => code.id)))}
                  className={fluentButton('secondary')}
                >
                  全选
                </button>
                {codesList.length > MAX_LABEL_EXPORT && (
                  <button
                    type="button"
                    onClick={() => setSelectedCodeIds(new Set(codesList.slice(0, MAX_LABEL_EXPORT).map((code) => code.id)))}
                    className={fluentButton('secondary')}
                  >
                    选择前 500 个
                  </button>
                )}
                <button type="button" disabled={selectedCodeIds.size === 0} onClick={() => setSelectedCodeIds(new Set())} className={fluentButton('subtle')}>
                  取消选择
                </button>
                {codesList.length > MAX_LABEL_EXPORT && <p className="w-full text-[#A4262C]">单次最多 500，请分批选择</p>}
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {codesLoading && <div className="py-12 text-center text-slate-400 text-sm">加载中…</div>}
                {!codesLoading && codesList.length === 0 && <p className="py-12 text-center text-slate-400 text-sm">该批次尚未生成任何溯源码</p>}
                {!codesLoading && codesList.length > 0 && (
                  <div className="space-y-2">
                    {codesList.map(c => (
                      <div key={c.id} className="flex flex-col items-stretch gap-2 rounded-[6px] border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-violet-200 sm:flex-row sm:items-center sm:gap-3">
                        <input
                          type="checkbox"
                          aria-label={`选择溯源码 ${c.code}`}
                          checked={selectedCodeIds.has(c.id)}
                          disabled={!selectedCodeIds.has(c.id) && selectedCodeIds.size >= MAX_LABEL_EXPORT}
                          onChange={(event) => {
                            setSelectedCodeIds((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked && next.size < MAX_LABEL_EXPORT) next.add(c.id);
                              if (!event.target.checked) next.delete(c.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 shrink-0 accent-[#0078D4]"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-slate-800">{c.code}</span>
                        <span className="text-xs text-slate-400 shrink-0">扫码 <span className="font-bold text-blue-600 font-mono">{c.scanCount}</span> 次</span>
                        <button onClick={() => copyLink(c.code)} title="复制溯源链接" className="flex items-center gap-1 text-violet-600 hover:text-white hover:bg-violet-600 text-xs font-bold border border-violet-100 bg-violet-50 px-2.5 py-1.5 rounded-lg transition-all">
                          <Copy className="w-3 h-3" /> 复制链接
                        </button>
                        <a href={traceUrl(c.code)} target="_blank" rel="noreferrer" title="新窗口打开溯源页" className="flex items-center gap-1 text-blue-600 hover:text-white hover:bg-blue-600 text-xs font-bold border border-blue-100 bg-blue-50 px-2.5 py-1.5 rounded-lg transition-all">
                          <ExternalLink className="w-3 h-3" /> 打开
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-[#E1DFDD] bg-white px-6 py-4">
                <p className="mb-3 text-sm text-[#605E5C]">导出已生成溯源码不会再次扣减二维码额度。</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={selectedCodeIds.size === 0}
                    onClick={() => openExistingCodeWorkspace(Array.from(selectedCodeIds))}
                    className={fluentButton('primary')}
                  >
                    导出选中（{selectedCodeIds.size}）
                  </button>
                  <button
                    type="button"
                    disabled={codesList.length === 0 || codesList.length > MAX_LABEL_EXPORT}
                    onClick={() => openExistingCodeWorkspace()}
                    className={fluentButton('secondary')}
                  >
                    导出全部
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 删除批次确认弹窗 */}
      {deleteTarget && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[6px] shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-start gap-4">
              <div className="p-3 rounded-full shrink-0 bg-rose-100 text-rose-600"><Trash2 className="w-6 h-6" /></div>
              <div>
                <h3 className="font-black text-slate-800 text-lg mb-1">删除批次</h3>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  即将删除批次 <span className="font-mono font-bold text-rose-600">{deleteTarget.label}</span>,此操作不可恢复。
                </p>
              </div>
            </div>
            <div className="px-6 py-5">
              {deleteTarget.generated > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-sm text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      该批次已签发 <span className="font-black">{deleteTarget.generated}</span> 个溯源码。删除将
                      <span className="font-black">连带清除全部溯源码、扫码记录、溯源事件、资质检测及农事记录</span>,消费者将无法再扫码验真。
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" checked={forceConfirm} onChange={(e) => setForceConfirm(e.target.checked)} className="rounded text-rose-600 border-slate-300 focus:ring-rose-500 h-4 w-4" />
                    <span className="text-sm font-bold text-slate-700">我已知晓风险,确认强制删除该批次及全部关联溯源数据</span>
                  </label>
                </div>
              ) : (
                <p className="text-sm text-slate-500">该批次尚未签发溯源码,将连带删除其农事记录。</p>
              )}
            </div>
            <div className="p-5 flex justify-end gap-3 bg-white border-t border-slate-100">
              <button onClick={closeDelete} disabled={deleting} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">取消</button>
              <button
                onClick={() => void handleDeleteBatch()}
                disabled={deleting || (deleteTarget.generated > 0 && !forceConfirm)}
                className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {deleting ? '删除中…' : deleteTarget.generated > 0 ? '强制删除' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
function CreateBatchModal({
  fields, onClose, onCreated,
}: {
  fields: Field[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [batchNo, setBatchNo] = useState('');
  const [cropName, setCropName] = useState('');
  const [plantDate, setPlantDate] = useState('');
  const [expectedHarvest, setExpectedHarvest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErr(null);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) {
      submittingRef.current = false;
      setErr('请选择地块');
      return;
    }
    setSubmitting(true);
    try {
      const dto: CreateBatchDto = {
        ownerId: field.ownerId,
        fieldId: field.id,
        batchNo,
        cropName,
        plantDate: new Date(plantDate).toISOString(),
        expectedHarvest: new Date(expectedHarvest).toISOString(),
        status: BatchStatus.PLANTING,
      };
      await createBatch(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-labelledby="createBatchTitle"
         onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <form onSubmit={submit} className="bg-white rounded-[6px] shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 id="createBatchTitle" className="font-bold text-slate-800 text-lg">新建批次</h3>
        {fields.length === 0 && <p className="text-amber-600 text-sm">请先创建地块后再建批次。</p>}
        <label htmlFor="create-batch-field" className="block text-xs font-bold text-slate-500">所属地块
          <select id="create-batch-field" value={fieldId} onChange={(e) => setFieldId(e.target.value)} required autoFocus disabled={submitting}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label htmlFor="create-batch-batchNo" className="block text-xs font-bold text-slate-500">批次号
          <input id="create-batch-batchNo" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required disabled={submitting}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label htmlFor="create-batch-cropName" className="block text-xs font-bold text-slate-500">品种
          <input id="create-batch-cropName" value={cropName} onChange={(e) => setCropName(e.target.value)} required disabled={submitting}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label htmlFor="create-batch-plantDate" className="block text-xs font-bold text-slate-500">种植日期
          <input id="create-batch-plantDate" type="date" value={plantDate} onChange={(e) => setPlantDate(e.target.value)} required disabled={submitting}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label htmlFor="create-batch-harvest" className="block text-xs font-bold text-slate-500">预计收获
          <input id="create-batch-harvest" type="date" value={expectedHarvest} onChange={(e) => setExpectedHarvest(e.target.value)} required disabled={submitting}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50">取消</button>
          <button type="submit" disabled={submitting || fields.length === 0}
            className="px-5 py-2 bg-[#0078D4] text-white rounded-lg text-sm font-bold disabled:opacity-50">
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
