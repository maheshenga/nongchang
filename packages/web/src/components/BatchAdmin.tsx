import { Layers, Plus, Search, Filter, TrendingUp, Calculator, X, QrCode, Printer, CheckCircle, ShieldCheck, Download, FileText, FileSpreadsheet, Loader2, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Eye, Copy, ExternalLink, ScanLine, Trash2 } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useApi } from '../hooks/useApi';
import { showToast } from '../hooks/useToast';
import { listBatches, createBatch, getBatchLifecycle, deleteBatch, type Batch } from '../api/batches';
import { listFields, type Field } from '../api/fields';
import { createTraceGenerationRequestKey, generateCodes, listCodes, type TraceCode } from '../api/trace';
import { downloadCSV } from '../utils/csv';
import BatchCredentialModal from './BatchCredentialModal';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';

interface ViewBatch {
  id: string;
  code: string;
  type: string;
  date: string;
  house: string;
  owner: string;
  stage: string;
  color: string;
  inputCost: number;
  laborCost: number;
  sellPrice: number;
  generated: number;
  scanTotal: number;
}

const STATUS_COLOR: Record<string, string> = {
  [BatchStatus.PLANTING]: 'cyan',
  [BatchStatus.GROWING]: 'emerald',
  [BatchStatus.HARVESTED]: 'amber',
  [BatchStatus.DISTRIBUTED]: 'indigo',
};

// 生长阶段中文展示。
const STATUS_LABEL: Record<string, string> = {
  [BatchStatus.PLANTING]: '种植中',
  [BatchStatus.GROWING]: '生长中',
  [BatchStatus.HARVESTED]: '已收获',
  [BatchStatus.DISTRIBUTED]: '已分销',
};

const PAGE_SIZE = 10;

function toViewBatch(b: Batch): ViewBatch {
  return {
    id: b.id,
    code: b.batchNo,
    type: b.cropName,
    date: b.plantDate.slice(0, 10),
    house: b.fieldId.slice(0, 8),
    owner: b.ownerName ?? '—',
    stage: b.status,
    color: STATUS_COLOR[b.status] ?? 'slate',
    inputCost: b.inputCost,
    laborCost: b.laborCost,
    sellPrice: b.sellPrice,
    generated: b.codeCount,
    scanTotal: b.scanTotal,
  };
}

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
  const filteredData = useMemo(() => {
    return batches.filter(b => {
      const matchCode = searchCode ? b.code.toLowerCase().includes(searchCode.toLowerCase()) : true;
      const matchType = filterType === 'all' ? true : b.type.includes(filterType);
      const matchHouse = filterHouse === 'all' ? true : b.house.includes(filterHouse);
      
      let matchDate = true;
      if (filterDateRange === '2024') matchDate = b.date.startsWith('2024');
      if (filterDateRange === '2023') matchDate = b.date.startsWith('2023');

      return matchCode && matchType && matchHouse && matchDate;
    });
  }, [searchCode, filterType, filterHouse, filterDateRange, batches]);

  // 客户端分页:数据已全量拉取,仅在前端切片。
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [searchCode, filterType, filterHouse, filterDateRange]);
  const pagedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
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
  // 删除确认:存待删批次 {id, label, generated};有码时需二次强制确认。
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; generated: number } | null>(null);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showProfitModal, setShowProfitModal] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  // 资质/检测管理弹窗:存当前批次 {id, label}。
  const [credentialBatch, setCredentialBatch] = useState<{ id: string; label: string } | null>(null);
  const [qrAmount, setQrAmount] = useState<number>(100);
  // 一物一码:进入排版预览时为批次真实生成的溯源码列表。
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const generationRequestKeys = useRef<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [paperSize, setPaperSize] = useState('4x6');
  
  // Custom layout config
  const [labelPaddingX, setLabelPaddingX] = useState<number>(16);
  const [labelSpacing, setLabelSpacing] = useState<number>(4);
  const [showAntiFakeLogo, setShowAntiFakeLogo] = useState<boolean>(true);
  
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  // 排版沙盒:纸张边距 / 标签行间距 / 二维码尺寸 + 三个元素投射开关,实时映射到右侧画布。
  const [sheetMargin, setSheetMargin] = useState<number>(16);
  const [sheetGap, setSheetGap] = useState<number>(12);
  const [sheetQrSize, setSheetQrSize] = useState<number>(80);
  const [showShield, setShowShield] = useState<boolean>(true);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showSerial, setShowSerial] = useState<boolean>(true);
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
      const hasRecords = (lc.farmRecords?.length ?? 0) > 0;
      const hasCodes = (lc.codeCount ?? 0) > 0;
      const hasEvents = (lc.traceEvents?.length ?? 0) > 0;
      const hasScans = (lc.scanTotal ?? 0) > 0;
      const checks = [
        { label: '农事记录已归档(种植/施肥/检测留痕)', ok: hasRecords },
        { label: '防伪溯源码已签发并可供扫验', ok: hasCodes },
        { label: '溯源链路事件节点完整可追', ok: hasEvents },
        { label: '终端消费者已产生有效扫码核验', ok: hasScans },
      ];
      const score = checks.filter(c => c.ok).length * 25;
      setComplianceData({ score, checks });
      setShowComplianceReport(id);
    } catch (e) {
      showToast(e instanceof Error ? `合规探针失败:${e.message}` : '合规探针失败');
    } finally {
      setIsScanningCompliance(false);
    }
  };

  // 计算批次毛利率文本,供 CSV 导出复用。
  const marginText = (input: number, labor: number, sell: number) => {
    if (sell === 0) return '待分销预测';
    return `${(((sell - (input + labor)) / sell) * 100).toFixed(1)}%`;
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    setExportDropdownOpen(false);
    const targets = selectedIds.size > 0
      ? batches.filter(b => selectedIds.has(b.id))
      : batches;
    setPendingAction({
      type: 'export',
      title: `导出批次数据 (${format.toUpperCase()})`,
      description: selectedIds.size > 0
        ? `即将导出已选中的 ${targets.length} 个批次的生命周期、财务与合规数据为 ${format.toUpperCase()} 文件。`
        : `即将导出当前系统中全部 ${targets.length} 个批次的生命周期、财务与合规数据为 ${format.toUpperCase()} 文件。`,
      affectedCount: targets.length,
      format,
      onConfirm: () => {
        setPendingAction(null);
        setIsExporting(format);
        try {
          if (format === 'excel') {
            const header = ['批次号', '品种', '种植日期', '地块', '归属商户', '状态', '已签发码数', '累计扫码', '投入成本', '人工成本', '售价', '毛利率'];
            const rows = targets.map(b => [
              b.code, b.type, b.date, b.house, b.owner, b.stage,
              b.generated, b.scanTotal, b.inputCost, b.laborCost, b.sellPrice,
              marginText(b.inputCost, b.laborCost, b.sellPrice),
            ]);
            downloadCSV(`批次数据报表_${new Date().toISOString().split('T')[0]}.csv`, [header, ...rows]);
            showToast(`已导出 ${targets.length} 个批次的 Excel 数据报表`);
          } else {
            // PDF:走浏览器打印(用户可另存为 PDF)。
            window.print();
          }
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
      title: `一键生成溯源报告 -> ${batch?.code ?? id}`,
      description: `系统将拉取该批次的农事记录与溯源链路明细,汇总导出为可用 Excel 打开的 CSV 溯源报告。`,
      affectedCount: 1,
      batchId: id,
      onConfirm: async () => {
        setPendingAction(null);
        setIsExportingReport(id);
        try {
          const lc = await getBatchLifecycle(id);
          const rows: Array<Array<unknown>> = [];
          rows.push(['溯源报告', batch?.code ?? id]);
          rows.push(['品种', batch?.type ?? '']);
          rows.push(['种植日期', batch?.date ?? '']);
          rows.push(['当前阶段', batch?.stage ?? '']);
          rows.push(['已签发码数', lc.codeCount ?? 0]);
          rows.push(['累计扫码', lc.scanTotal ?? 0]);
          rows.push([]);
          rows.push(['农事记录明细']);
          rows.push(['时间', '动作', '备注']);
          for (const r of lc.farmRecords ?? []) {
            const rec = r as Record<string, unknown>;
            const when = rec.recordedAt ? String(rec.recordedAt).slice(0, 10) : '';
            rows.push([when, rec.action ?? '', rec.note ?? '']);
          }
          rows.push([]);
          rows.push(['溯源链路事件']);
          rows.push(['时间', '事件', '描述']);
          for (const ev of lc.traceEvents ?? []) {
            const e = ev as Record<string, unknown>;
            const when = e.occurredAt ? String(e.occurredAt).slice(0, 10) : '';
            rows.push([when, e.eventType ?? '', e.description ?? '']);
          }
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

  const calculateMargin = (input: number, labor: number, sell: number) => {
    const totalCost = input + labor;
    if (sell === 0) return { margin: 0, text: '待分销预测', expectedSell: totalCost * 1.5 };
    const margin = ((sell - totalCost) / sell) * 100;
    return { margin, text: `${margin.toFixed(1)}%`, expectedSell: sell };
  };

  const activeBatch = batches.find(b => b.id === showQrModal);

  // 生码数量校验:须为 1~10000 的整数(与后端 MAX_CODES_PER_BATCH 一致)。
  const MAX_CODES = 10000;
  const qrAmountValid = Number.isInteger(qrAmount) && qrAmount >= 1 && qrAmount <= MAX_CODES;

  // 消费者扫码访问的真实溯源页 URL(hash 路由 H5)。
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;
  // 标签按索引取真实码;未生成时回退到批次号占位(仅预览,导出前会真实生成)。
  const codeForIndex = (i: number) => generatedCodes[i] ?? `${activeBatch?.code ?? ''}-预览${i + 1}`;

  // 进入排版沙盒前为批次真实生成 qrAmount 个唯一溯源码。
  const getGenerationRequestKey = (source: string, batchId: string, count: number) => {
    const operationKey = `${source}:${batchId}:${count}`;
    generationRequestKeys.current[operationKey] ??= createTraceGenerationRequestKey(source, batchId, count);
    return generationRequestKeys.current[operationKey];
  };
  const clearGenerationRequestKey = (source: string, batchId: string, count: number) => {
    delete generationRequestKeys.current[`${source}:${batchId}:${count}`];
  };

  const handleGenerateCodes = async (): Promise<boolean> => {
    if (!showQrModal) return false;
    setGenerating(true);
    try {
      const requestKey = getGenerationRequestKey('batch-label-preview', showQrModal, qrAmount);
      const codes = await generateCodes(showQrModal, qrAmount, requestKey);
      setGeneratedCodes(codes.map(c => c.code));
      clearGenerationRequestKey('batch-label-preview', showQrModal, qrAmount);
      return true;
    } catch (e) {
      showToast(e instanceof Error ? `生成溯源码失败:${e.message}` : '生成溯源码失败');
      return false;
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
    setCodesBatchId(id);
    setCodesList([]);
    setCodesLoading(true);
    try {
      setCodesList(await listCodes(id));
    } catch (e) {
      showToast(e instanceof Error ? `加载溯源码失败:${e.message}` : '加载溯源码失败');
      setCodesBatchId(null);
    } finally {
      setCodesLoading(false);
    }
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
    <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg overflow-visible relative">
      <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between bg-slate-50/50 shrink-0 gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg shadow-sm">
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
              className={`flex items-center gap-2 border bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${isExporting ? 'opacity-50 cursor-not-allowed border-slate-200' : 'border-slate-200'} focus:ring-4 focus:ring-slate-100`}
            >
              {isExporting ? <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" /> : <Download className="w-4 h-4 text-slate-500" />}
              {isExporting ? `正在安全生成 ${isExporting.toUpperCase()}...` : selectedIds.size > 0 ? `数据报表下发 (已选 ${selectedIds.size})` : '数据报表下发'}
            </button>
            {exportDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in slide-in-from-top-2">
                <button onClick={() => handleExport('pdf')} className="w-full text-left px-5 py-3 text-sm font-bold text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-3 transition-colors border-b border-slate-100">
                  <div className="bg-red-100 text-red-600 p-1.5 rounded-md"><FileText className="w-4 h-4" /></div> 标准 PDF 溯源版
                </button>
                <button onClick={() => handleExport('excel')} className="w-full text-left px-5 py-3 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-3 transition-colors">
                  <div className="bg-emerald-100 text-emerald-600 p-1.5 rounded-md"><FileSpreadsheet className="w-4 h-4" /></div> 原始 Excel 数据表
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
              className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 shadow-sm w-full transition-all" 
            />
          </div>
          <button 
            onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
            className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${showAdvancedFilter ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}
          >
            <Filter className={`w-4 h-4 ${showAdvancedFilter ? 'text-slate-300' : 'text-slate-500'}`} />
            高级筛选过滤
            <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${showAdvancedFilter ? 'rotate-180 text-slate-400' : 'text-slate-400'}`} />
          </button>
          <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm shadow-emerald-600/20 focus:ring-4 focus:ring-emerald-500/30">
            <Plus className="w-4 h-4" />
            新建管理批次
          </button>
        </div>
      </div>
      
      {showAdvancedFilter && (
        <div className="bg-slate-50/80 border-b border-slate-200/60 p-5 shrink-0 flex flex-wrap items-end gap-5 animate-in fade-in slide-in-from-top-2">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">目标农产品种类</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-48 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
              <option value="all">全产品类别</option>
              <option value="春白芍">春白芍组系列</option>
              <option value="紫凤">紫凤朝阳系</option>
              <option value="墨玉">冠世墨玉系列</option>
              <option value="滇红">滇红系列</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">源头所属地块/大棚</label>
            <select value={filterHouse} onChange={(e) => setFilterHouse(e.target.value)} className="w-48 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
              <option value="all">所有源头区域记录</option>
              <option value="A区">云岭 A区-温室大棚</option>
              <option value="B区">云岭 B区-露地防寒林</option>
              <option value="C区">科创 C区-组培研发站</option>
              <option value="D区">农大 D区-试验改良田</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">批次创建时间跨度</label>
            <select value={filterDateRange} onChange={(e) => setFilterDateRange(e.target.value)} className="w-48 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
              <option value="all">全时间段沉淀</option>
              <option value="2024">2024 自然年度</option>
              <option value="2023">2023 自然年度</option>
            </select>
          </div>
          <div className="flex-1"></div>
        </div>
      )}

      <div className="p-0 bg-slate-50/30">
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
                   className="rounded text-emerald-600 border-slate-300 focus:ring-emerald-500"
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
                 className="hover:bg-emerald-50/20 transition-colors group"
              >
                <td className="px-6 py-4 border-l-2 border-transparent group-hover:border-emerald-500">
                    <input
                      type="checkbox"
                      className="rounded text-emerald-600 border-slate-300 focus:ring-emerald-500"
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
                     <div className="w-2 h-2 rounded-full hidden sm:block bg-slate-300 group-hover:bg-emerald-500 transition-colors"></div>
                     {b.type}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs font-mono">{b.date}</td>
                <td className="px-6 py-4 text-slate-600 font-medium text-sm">{b.house}</td>
                <td className="px-6 py-4 text-slate-700 font-bold text-sm">{b.owner}</td>
                <td className="px-6 py-4 font-mono font-black text-emerald-600 text-right text-base">{b.generated} <span className="text-xs text-slate-400 font-normal">张</span></td>
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
                    className="flex items-center justify-center gap-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 font-bold text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg transition-all shadow-sm"
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
        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            共 <span className="font-bold text-slate-700">{filteredData.length}</span> 个批次,第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> 上一页
            </button>
            {Array.from({ length: totalPages }).map((_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`min-w-[32px] px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${p === page ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 border border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一页 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* QR Generation Modal */}
      {showQrModal && activeBatch && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col md:flex-row transform transition-all h-[90vh] md:h-auto max-h-[800px]">
              <div className="w-full md:w-[55%] p-8 border-r border-slate-100 bg-slate-50/80 flex flex-col overflow-y-auto">
                 <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold text-slate-800 text-xl flex items-center gap-3">
                       <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl shadow-sm">
                         <QrCode className="w-6 h-6" /> 
                       </div>
                       专属溯源标签批量引擎
                    </h3>
                 </div>
                 
                 <div className="space-y-6 flex-1">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                       <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                         <Layers className="w-6 h-6" />
                       </div>
                       <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">当前挂载目标批次序列</label>
                         <div className="text-sm font-black text-slate-800 tracking-wide">
                           <span className="font-mono text-blue-600 mr-2 bg-blue-50 px-2 py-0.5 rounded">{activeBatch.id}</span> 
                           {activeBatch.type}
                         </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                         <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">物理标签纸张切割规格 <span className="text-[10px] text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded ml-2 normal-case">热敏打印机必须参数</span></label>
                         <select 
                           value={paperSize} 
                           onChange={(e) => setPaperSize(e.target.value)}
                           className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                         >
                            <option value="4x6">标准物流特大外箱贴 (4"x6")</option>
                            <option value="2x1">盆栽单株植物迷你标 (2"x1")</option>
                            <option value="A4">A4 激光不干胶合集阵列 (每页21贴)</option>
                         </select>
                      </div>

                      <div className="col-span-2">
                         <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">预设批量衍生总数 <span className="text-[10px] text-slate-400 font-normal ml-2 tracking-normal">(单批次 1 ~ {MAX_CODES} 张)</span></label>
                         <div className="relative">
                           <input
                              type="number"
                              min={1}
                              max={MAX_CODES}
                              value={qrAmount}
                              onChange={(e) => setQrAmount(Math.floor(Number(e.target.value)))}
                              className={`w-full pl-4 pr-12 py-3 bg-white border rounded-xl text-lg font-black text-slate-800 shadow-sm focus:outline-none focus:ring-2 font-mono transition-all ${qrAmountValid ? 'border-slate-200 focus:ring-blue-500/20 focus:border-blue-500' : 'border-rose-300 focus:ring-rose-500/20 focus:border-rose-500'}`}
                           />
                           <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">张</span>
                         </div>
                         {!qrAmountValid && (
                           <p className="mt-2 text-xs font-bold text-rose-500 flex items-center gap-1.5">
                             <AlertTriangle className="w-3.5 h-3.5" /> 生成数量须为 1 ~ {MAX_CODES} 的整数
                           </p>
                         )}
                      </div>
                    </div>
                    
                    <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-4 shadow-sm group hover:border-slate-300 transition-colors">
                       <div className="flex items-center gap-2 mb-2">
                         <Calculator className="w-4 h-4 text-slate-400" />
                         <span className="text-xs font-bold text-slate-800 uppercase tracking-widest">高级矢量排版控制器</span>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">X/Y 轴间距容斥 (px)</label>
                             <input type="number" value={labelSpacing} onChange={(e) => setLabelSpacing(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-500/20 transition-all font-mono" />
                          </div>
                          <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">安全出血边距 (px)</label>
                             <input type="number" value={labelPaddingX} onChange={(e) => setLabelPaddingX(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-500/20 transition-all font-mono" />
                          </div>
                       </div>
                       <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-lg border border-slate-100 hover:bg-slate-100 transition-colors mt-2">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${showAntiFakeLogo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
                             <CheckCircle className="w-3.5 h-3.5" />
                          </div>
                          <input type="checkbox" checked={showAntiFakeLogo} onChange={(e) => setShowAntiFakeLogo(e.target.checked)} className="hidden" />
                          <span className="text-xs font-bold text-slate-700 tracking-wide">强制印制官方政府防伪溯源防撕 Logo 栏</span>
                       </label>
                    </div>
                    
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100/50 text-xs text-blue-800 flex items-start gap-3 shadow-sm">
                       <div className="bg-white p-1.5 rounded-lg border border-blue-100 shadow-sm shrink-0">
                         <Printer className="w-4 h-4 text-blue-600" />
                       </div>
                       <p className="leading-relaxed font-medium">生态级跨端支持：您可以将生成的防伪溯源码阵列无损导出为高清晰度 PDF 印刷文件，或通过驱动级直接投递至本地局域网任意 ZPL/TSPL 协议工业热敏条码打印机。</p>
                    </div>
                 </div>
                 
                 {/* Push down controls */}
                 <div className="flex-1 min-h-[40px]"></div>

                 <div className="mt-8 flex justify-between gap-4 shrink-0">
                    <button onClick={() => setShowQrModal(null)} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl shadow-sm hover:bg-slate-50 hover:border-slate-300 font-bold text-sm transition-all focus:ring-4 focus:ring-slate-100 min-w-[120px]">暂缓生成</button>
                    <button onClick={() => {
                        setPendingAction({
                          type: 'generate',
                          title: '批量生成并导出溯源标签矩阵',
                          description: `将针对高优批次 [${activeBatch?.id}] 同步派生出 ${qrAmount} 枚具有唯一标识防伪哈希值的溯源码 (物理输出尺寸: ${paperSize})。当前系统操作不可逆，是否授权推进？`,
                          affectedCount: qrAmount,
                          batchId: activeBatch?.id,
                          onConfirm: async () => {
                             const ok = await handleGenerateCodes();
                             setPendingAction(null);
                             if (ok) setShowPdfPreview(true);
                          }
                        });
                    }} disabled={!qrAmountValid} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-bold text-sm transition-all flex items-center justify-center gap-2 transform active:scale-[0.98] focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
                       进入排版沙盒与输出
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                 </div>
              </div>

              <div className="w-full md:w-[45%] p-8 flex flex-col items-center justify-center bg-[#f1f5f9] relative overflow-hidden border-t md:border-t-0 border-slate-200">
                 <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg p-2 transition-colors z-20 md:hidden">
                    <X className="w-6 h-6" />
                 </button>
                 <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full text-[10px] font-black text-slate-600 uppercase tracking-widest shadow-sm border border-slate-200 z-20 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    实时物理标尺预览沙盒
                 </div>
                 
                 {/* Preview mock parent container to simulate environment */}
                 <div className="w-full h-full flex flex-col items-center justify-center z-10 p-6 min-h-[400px]">
                   <div 
                     style={{ padding: `${labelPaddingX}px`, gap: `${labelSpacing}px` }}
                     className={`bg-white shadow-2xl relative transition-all duration-300 transform md:scale-100 scale-90 origin-center select-none ring-1 ring-slate-200/50
                     ${paperSize === '4x6' ? 'w-[280px] min-h-[420px] flex flex-col rounded-md' : 
                       paperSize === '2x1' ? 'w-[200px] h-28 flex items-center justify-between rounded-sm px-2' : 
                       'w-[350px] h-[480px] grid grid-cols-2 grid-rows-4 rounded bg-slate-50'}`}
                   >
                      {paperSize === '4x6' ? (
                         <div className="flex-1 flex flex-col h-full border-[3px] border-slate-200 border-dashed rounded overflow-hidden relative">
                           {showAntiFakeLogo && (
                             <div className="text-center bg-slate-900 flex items-center justify-center gap-2 text-white font-black py-3 tracking-widest text-xs shrink-0">
                               <ShieldCheck className="w-4 h-4 text-emerald-400" />
                               官方溯源认证引擎
                             </div>
                           )}
                           <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                             <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                                <QRCodeSVG value={traceUrl(codeForIndex(0))} size={140} level="H" />
                             </div>
                             <div className="mt-5 flex flex-col items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 w-full text-center">
                               <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">唯一数字映射标识</span>
                               <span className="font-mono font-black text-xl text-slate-900 tracking-widest bg-white px-2 rounded shadow-sm border border-slate-100 w-full overflow-hidden text-ellipsis">
                                 {codeForIndex(0)}
                               </span>
                             </div>
                           </div>
                           <div className="bg-slate-50 border-t-[3px] border-dashed border-slate-200 p-4 text-xs space-y-2.5 shrink-0">
                             <div className="flex justify-between items-center border-b border-slate-200/50 pb-2"><span className="text-slate-500 font-bold">农科培育品种:</span> <span className="font-black text-slate-800 text-sm tracking-wide bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">{activeBatch.type}</span></div>
                             <div className="flex justify-between items-center"><span className="text-slate-500 font-bold">法定备案原产地:</span> <span className="font-black text-slate-800 tracking-wide">云南·大理白族自治州</span></div>
                           </div>
                         </div>
                      ) : paperSize === '2x1' ? (
                         <div className="flex-1 w-full h-full border-2 border-slate-200 border-dashed rounded-sm flex flex-row items-center justify-between p-2 bg-white relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-8 h-8 bg-slate-50 origin-bottom-left transform rotate-45 translate-x-4 -translate-y-4"></div>
                           <div className="p-1 border border-slate-100 rounded-md bg-white shadow-sm shrink-0">
                             <QRCodeSVG value={traceUrl(codeForIndex(0))} size={showAntiFakeLogo ? 60 : 76} level="H" />
                           </div>
                           <div className="flex-1 ml-3 text-right flex flex-col justify-center h-full">
                             {showAntiFakeLogo && <div className="text-[8px] font-black text-emerald-600 mb-1 tracking-widest flex justify-end items-center gap-1 uppercase"><ShieldCheck className="w-2.5 h-2.5" /> 核准溯源</div>}
                             <div className="font-black text-xs text-slate-800 leading-tight tracking-wide bg-slate-50 px-1 py-0.5 rounded ml-auto border border-slate-100 mb-1 w-max max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{activeBatch.type}</div>
                             <div className="font-mono font-bold text-[9px] text-slate-500 mt-auto truncate tracking-widest px-1">{codeForIndex(0)}</div>
                           </div>
                         </div>
                      ) : (
                       Array.from({length: 8}).map((_, i) => (
                          <div key={i} className="border border-slate-300 border-dashed rounded flex flex-col items-center justify-center p-1 bg-white relative">
                             {showAntiFakeLogo && <ShieldCheck className="absolute top-1 left-1 w-2.5 h-2.5 text-emerald-500 opacity-50" />}
                             <QRCodeSVG value={traceUrl(codeForIndex(i))} size={38} level="L" />
                             <div className="text-[6px] font-mono mt-1 text-slate-600 bg-slate-100 px-1 rounded">{codeForIndex(i).substring(0,8)}</div>
                          </div>
                       ))
                    )}
                 </div>
              </div>
           </div>
        </div>
        </div>
      )}

      {/* PDF Generation Print Preview (Full Screen) */}
      {showPdfPreview && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm shadow-2xl p-4">
            <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-300">
               <div className="p-6 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                     <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm">
                       <Printer className="w-5 h-5" />
                     </div>
                     可视化标签排版及导出引擎
                     <span className="text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1 rounded-full ml-3 hidden sm:inline-block shadow-sm">
                       序列号列队: 1 ~ {qrAmount}
                     </span>
                  </h3>
                  <button onClick={() => setShowPdfPreview(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
               </div>
               
               <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
                  {/* Left Side: Layout Configurator */}
                  <div className="w-full md:w-80 bg-white border-r border-slate-200/60 p-6 overflow-y-auto shrink-0 flex flex-col gap-8 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] relative z-10">
                     <div>
                        <h4 className="font-black text-[11px] text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">
                           <Layers className="w-3.5 h-3.5" /> 纸张版式控制器
                        </h4>
                        
                        <div className="space-y-6">
                           <div>
                              <label className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                                <span>纸张边距 (X/Y)</span>
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{sheetMargin}px</span>
                              </label>
                              <input type="range" min="0" max="40" value={sheetMargin} onChange={(e) => setSheetMargin(Number(e.target.value))} className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-full appearance-none hover:accent-indigo-700 transition-all cursor-pointer" />
                           </div>

                           <div>
                              <label className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                                <span>标签行间距 (Gap)</span>
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{sheetGap}px</span>
                              </label>
                              <input type="range" min="0" max="32" value={sheetGap} onChange={(e) => setSheetGap(Number(e.target.value))} className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-full appearance-none hover:accent-indigo-700 transition-all cursor-pointer" />
                           </div>

                           <div>
                              <label className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                                <span>防伪溯源码尺寸比</span>
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{sheetQrSize}px</span>
                              </label>
                              <input type="range" min="40" max="120" value={sheetQrSize} onChange={(e) => setSheetQrSize(Number(e.target.value))} className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-full appearance-none hover:accent-indigo-700 transition-all cursor-pointer" />
                           </div>
                        </div>
                     </div>

                     <div className="h-px bg-slate-100 w-full"></div>

                     <div>
                        <h4 className="font-black text-[11px] text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">
                           <ShieldCheck className="w-3.5 h-3.5" /> 元算元素投射
                        </h4>
                        <div className="space-y-3">
                           <label className="flex items-center gap-3 text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              <input type="checkbox" checked={showShield} onChange={(e) => setShowShield(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-100 border-slate-300" />
                              渲染机构防伪盾牌标志
                           </label>
                           <label className="flex items-center gap-3 text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              <input type="checkbox" checked={showProductName} onChange={(e) => setShowProductName(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-100 border-slate-300" />
                              映射关联商品品名
                           </label>
                           <label className="flex items-center gap-3 text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              <input type="checkbox" checked={showSerial} onChange={(e) => setShowSerial(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-100 border-slate-300" />
                              挂载动态流水号序列
                           </label>
                        </div>
                     </div>

                     <div className="mt-auto pt-6">
                        <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100/50 rounded-xl text-xs text-indigo-800 leading-relaxed font-medium shadow-sm flex items-start gap-3">
                           <div className="bg-white p-1.5 rounded-lg shrink-0 shadow-sm border border-indigo-100">
                             <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                           </div>
                           左侧物理介质调校面板的参数将进行毫秒级热更新计算，直接映射至右侧高保真画布中。并以此最终态输出印刷级 PDF 文件。
                        </div>
                     </div>
                  </div>

                  {/* Right Side: Visual Canvas */}
                  <div className="flex-1 overflow-y-auto bg-[#e2e8f0] p-8 flex flex-col items-center relative pattern-boxes pattern-slate-300 pattern-bg-transparent pattern-size-4">
                     {/* Export Header Control */}
                     <div className="bg-white/90 backdrop-blur-md sticky top-0 z-20 mb-6 px-6 py-3 rounded-2xl shadow-sm border border-slate-200 w-full max-w-4xl flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded shadow-sm border border-slate-100">A4 标准预切不干胶 (21贴/页)</span>
                          <span className="text-xs font-mono font-bold text-slate-400">总计 {Math.ceil(qrAmount / 21)} 页</span>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => {
                             window.print();
                          }} className="flex items-center justify-center gap-2 text-indigo-600 font-bold text-sm bg-white border border-indigo-100 px-5 py-2 rounded-xl transition-all shadow-sm hover:border-indigo-300 hover:shadow-md focus:ring-4 focus:ring-indigo-500/20 active:scale-95">
                            <Printer className="w-4 h-4" /> 对接本机打印驱动
                          </button>
                          <button onClick={() => {
                             setShowPdfPreview(false);
                             setShowQrModal(null);
                             showToast(`已为批次生成 ${generatedCodes.length} 个唯一溯源码并导出标签。`);
                             setGeneratedCodes([]);
                          }} className="flex items-center justify-center gap-2 text-white font-bold text-sm bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded-xl transition-all shadow border border-indigo-700/50 focus:ring-4 focus:ring-indigo-500/30 active:scale-95">
                            <Download className="w-4 h-4" /> 导出印刷级 PDF
                          </button>
                        </div>
                     </div>
                     
                     <div style={{ padding: `${sheetMargin}px`, gap: `${sheetGap}px` }} className="print-sheet bg-white shadow-2xl ring-1 ring-slate-900/5 min-h-[842px] w-[595px] grid grid-cols-3 pb-20 transform transition-transform hover:scale-[1.02] duration-500 ease-out origin-top border-t-8 border-indigo-600">
                        {Array.from({length: Math.min(21, qrAmount)}).map((_, i) => (
                           <div key={i} className="border-2 border-dashed border-slate-300 rounded p-2 flex flex-col items-center justify-center relative hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="absolute top-1 left-1 flex items-center gap-1">
                                 {showShield && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                              </div>
                              {showSerial && <div className="absolute top-1 right-1 text-[8px] text-slate-400 font-mono font-bold">{i+1}/{qrAmount}</div>}
                              <QRCodeSVG value={traceUrl(codeForIndex(i))} size={sheetQrSize} level="M" />
                              {showProductName && <div className="mt-2 text-[10px] font-bold text-slate-800 text-center">{activeBatch?.type}</div>}
                              {showSerial && <div className="text-[8px] text-slate-500 font-mono">{codeForIndex(i)}</div>}
                              <div className="absolute inset-0 border-2 border-indigo-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"></div>
                           </div>
                        ))}
                     </div>
                     {qrAmount > 21 && (
                        <div className="mt-6 text-slate-500 font-bold text-sm bg-white px-6 py-3 rounded-full shadow-md border border-slate-200">
                           ... 以及其他 {qrAmount - 21} 张标签分页显示 ...
                        </div>
                     )}
                  </div>
               </div>

               <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3 shrink-0">
                  <button onClick={() => setShowPdfPreview(false)} className="px-5 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors">返回设置</button>
                  <button onClick={() => {
                     window.print();
                     setShowPdfPreview(false);
                     setShowQrModal(null);
                     showToast(`已成功为批次生成 ${qrAmount} 张溯源防伪码`);
                  }} className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow flex items-center gap-2">
                     <Printer className="w-5 h-5" /> 确认排版并打印 PDF
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Profit Analysis Plugin Modal */}
      {/* Compliance Scan Report Modal */}
      {showComplianceReport && (
         <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="合规探针">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="flex justify-between items-center bg-gradient-to-r from-emerald-50 to-teal-50 p-6 border-b border-emerald-100/50 relative overflow-hidden">
                  <ShieldCheck className="absolute -left-4 -bottom-4 w-24 h-24 text-emerald-500/10 -rotate-12" />
                  <h3 className="font-bold text-emerald-800 text-lg flex items-center gap-3 relative z-10">
                     <div className="p-2 bg-emerald-100/80 rounded-lg shadow-sm">
                       <ShieldCheck className="w-5 h-5 text-emerald-700" />
                     </div>
                     溯源法定合规性自动化探针
                  </h3>
                  <button onClick={() => setShowComplianceReport(null)} className="text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 p-2 rounded-lg transition-colors relative z-10"><X className="w-5 h-5" /></button>
               </div>
               <div className="p-8">
                  <div className="flex items-center gap-6 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
                     <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 border-white shadow-md relative shrink-0 ${(complianceData?.score ?? 0) >= 75 ? 'bg-emerald-100 text-emerald-600' : (complianceData?.score ?? 0) >= 50 ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                        <div className={`absolute inset-0 border-4 rounded-full opacity-20 animate-ping ${(complianceData?.score ?? 0) >= 75 ? 'border-emerald-500' : (complianceData?.score ?? 0) >= 50 ? 'border-amber-500' : 'border-rose-500'}`}></div>
                        <span className="text-2xl font-black">{complianceData?.score ?? 0}<span className="text-sm">%</span></span>
                     </div>
                     <div>
                        <div className="text-base font-black text-slate-800 mb-1.5 flex items-center gap-2">
                          {(complianceData?.score ?? 0) >= 75
                            ? '接近完全符合法定花卉安全溯源配置规范'
                            : (complianceData?.score ?? 0) >= 50
                            ? '基本符合,仍有关键溯源要素待补齐'
                            : '溯源配置严重不足,需尽快补全'}
                          {(complianceData?.score ?? 0) >= 75 && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">当前挂载抽检批次号流水: <span className="font-mono font-bold bg-white text-slate-700 px-2 py-0.5 rounded shadow-sm border border-slate-200 ml-1">{showComplianceReport}</span></div>
                     </div>
                  </div>

                  <div className="space-y-3 relative before:absolute before:inset-y-4 before:left-[1.375rem] before:w-0.5 before:bg-slate-100">
                     {(complianceData?.checks ?? []).map((c, i) => (
                       c.ok ? (
                         <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl relative z-10 shadow-sm hover:border-emerald-200 transition-colors">
                            <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                               <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-emerald-200">
                                 <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                               </div>
                               {c.label}
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">已挂载</span>
                         </div>
                       ) : (
                         <div key={i} className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl relative z-10 shadow-sm shadow-amber-100/50 overflow-hidden group">
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
                     <button onClick={() => setShowComplianceReport(null)} className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-slate-900/20 active:scale-95">关联合规探针工作台</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {showProfitModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="删除确认">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-purple-100/50">
              <div className="p-6 border-b border-purple-100/50 bg-gradient-to-r from-purple-50 to-fuchsia-50 flex items-center justify-between relative overflow-hidden">
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
                           <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl shadow-inner relative overflow-hidden border-t-[3px] border-t-amber-400">
                             <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">公允投入品总计结转成本 (沉没)</div>
                             <div className="text-xl font-black text-slate-800 font-mono tracking-tight"><span className="text-slate-400 font-sans mr-1">¥</span>{batch.inputCost.toLocaleString()}</div>
                           </div>
                           <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl shadow-inner relative overflow-hidden border-t-[3px] border-t-amber-500">
                             <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">全时段人工及地租分摊成本比率</div>
                             <div className="text-xl font-black text-slate-800 font-mono tracking-tight"><span className="text-slate-400 font-sans mr-1">¥</span>{batch.laborCost.toLocaleString()}</div>
                           </div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200/60 p-6 rounded-2xl flex items-center justify-between shadow-sm relative overflow-hidden">
                           <div className="relative z-10">
                             <div className="text-[10px] uppercase tracking-widest font-bold text-indigo-900 mb-1 flex items-center gap-1.5">
                               {batch.sellPrice > 0 ? (
                                 <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> 已锁定分销合同总出圃成交额</>
                               ) : (
                                 <><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> 沙盘预估市场终端公允成交规模</>
                               )}
                             </div>
                             <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-indigo-700 font-mono tracking-tighter"><span className="text-purple-400 text-2xl font-sans mr-1">¥</span>{res.expectedSell.toLocaleString()}</div>
                           </div>
                           <div className="text-right relative z-10 pl-6 border-l border-purple-200/50">
                             <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">模型重估毛利率动态指标</div>
                             <div className="text-4xl font-black text-emerald-500 tracking-tighter drop-shadow-sm">{res.text}</div>
                           </div>
                        </div>
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3 leading-relaxed shadow-sm">
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
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
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
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
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
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4"><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">品种</div><div className="text-sm font-black text-slate-800">{b?.type}</div></div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4"><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">种植日期</div><div className="text-sm font-black text-slate-800 font-mono">{b?.date}</div></div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4"><div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-1">已签发码数</div><div className="text-sm font-black text-emerald-700 font-mono">{detailData.codeCount ?? 0}</div></div>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4"><div className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mb-1">累计扫码</div><div className="text-sm font-black text-blue-700 font-mono">{detailData.scanTotal ?? 0}</div></div>
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
          <div className="absolute inset-0 z-[75] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-violet-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-violet-900 text-lg flex items-center gap-3">
                  <div className="p-2 bg-violet-200 text-violet-700 rounded-lg shadow-sm"><ScanLine className="w-5 h-5" /></div>
                  已生成溯源码 · <span className="font-mono text-violet-700">{b?.code}</span>
                  <span className="text-xs font-mono bg-white text-violet-600 px-2 py-0.5 rounded border border-violet-200">{codesList.length} 个</span>
                </h3>
                <button onClick={() => setCodesBatchId(null)} className="text-violet-400 hover:text-violet-700 hover:bg-violet-100 p-2 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {codesLoading && <div className="py-12 text-center text-slate-400 text-sm">加载中…</div>}
                {!codesLoading && codesList.length === 0 && <p className="py-12 text-center text-slate-400 text-sm">该批次尚未生成任何溯源码</p>}
                {!codesLoading && codesList.length > 0 && (
                  <div className="space-y-2">
                    {codesList.map(c => (
                      <div key={c.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:border-violet-200 transition-colors">
                        <span className="font-mono font-bold text-slate-800 text-sm flex-1 truncate">{c.code}</span>
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
            </div>
          </div>
        );
      })()}

      {/* 删除批次确认弹窗 */}
      {deleteTarget && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
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
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
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
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) { setErr('请选择地块'); return; }
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
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
         role="dialog" aria-modal="true" aria-labelledby="createBatchTitle"
         onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 id="createBatchTitle" className="font-bold text-slate-800 text-lg">新建批次</h3>
        {fields.length === 0 && <p className="text-amber-600 text-sm">请先创建地块后再建批次。</p>}
        <label htmlFor="create-batch-field" className="block text-xs font-bold text-slate-500">所属地块
          <select id="create-batch-field" value={fieldId} onChange={(e) => setFieldId(e.target.value)} required autoFocus
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label htmlFor="create-batch-batchNo" className="block text-xs font-bold text-slate-500">批次号
          <input id="create-batch-batchNo" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label htmlFor="create-batch-cropName" className="block text-xs font-bold text-slate-500">品种
          <input id="create-batch-cropName" value={cropName} onChange={(e) => setCropName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label htmlFor="create-batch-plantDate" className="block text-xs font-bold text-slate-500">种植日期
          <input id="create-batch-plantDate" type="date" value={plantDate} onChange={(e) => setPlantDate(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label htmlFor="create-batch-harvest" className="block text-xs font-bold text-slate-500">预计收获
          <input id="create-batch-harvest" type="date" value={expectedHarvest} onChange={(e) => setExpectedHarvest(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600">取消</button>
          <button type="submit" disabled={submitting || fields.length === 0}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
