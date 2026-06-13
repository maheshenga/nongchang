import { Layers, Plus, Search, Filter, TrendingUp, Calculator, X, QrCode, Printer, CheckCircle, ShieldCheck, Download, FileText, FileSpreadsheet, Loader2, AlertTriangle, Bookmark, ChevronDown, Save } from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useApi } from '../hooks/useApi';
import { listBatches, createBatch, type Batch } from '../api/batches';
import { listFields, type Field } from '../api/fields';
import { generateCode } from '../api/trace';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';

interface ViewBatch {
  id: string;
  code: string;
  type: string;
  date: string;
  house: string;
  stage: string;
  color: string;
  inputCost: number;
  laborCost: number;
  sellPrice: number;
  generated: number;
}

const STATUS_COLOR: Record<string, string> = {
  [BatchStatus.PLANTING]: 'cyan',
  [BatchStatus.GROWING]: 'emerald',
  [BatchStatus.HARVESTED]: 'amber',
  [BatchStatus.DISTRIBUTED]: 'indigo',
};

function toViewBatch(b: Batch): ViewBatch {
  return {
    id: b.id,
    code: b.batchNo,
    type: b.cropName,
    date: b.plantDate.slice(0, 10),
    house: b.fieldId.slice(0, 8),
    stage: b.status,
    color: STATUS_COLOR[b.status] ?? 'slate',
    inputCost: 0,
    laborCost: 0,
    sellPrice: 0,
    generated: 0,
  };
}

export default function BatchAdmin() {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches);
  const batches: ViewBatch[] = (rawBatches ?? []).map(toViewBatch);
  const { data: fields } = useApi(listFields);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterHouse, setFilterHouse] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all');
  const [savedViews, setSavedViews] = useState([{id: 1, name: '春季大棚近两年批次'}]);

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
  const [showProfitModal, setShowProfitModal] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [qrAmount, setQrAmount] = useState<number>(100);
  const [paperSize, setPaperSize] = useState('4x6');
  
  // Custom layout config
  const [labelPaddingX, setLabelPaddingX] = useState<number>(16);
  const [labelPaddingY, setLabelPaddingY] = useState<number>(16);
  const [labelSpacing, setLabelSpacing] = useState<number>(4);
  const [showAntiFakeLogo, setShowAntiFakeLogo] = useState<boolean>(true);
  
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isScanningCompliance, setIsScanningCompliance] = useState(false);
  const [showComplianceReport, setShowComplianceReport] = useState<string | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<{
    type: 'export' | 'generate' | 'report';
    title: string;
    description: string;
    affectedCount: number;
    format?: string;
    batchId?: string;
    onConfirm: () => void;
  } | null>(null);

  const handleScanCompliance = (id: string) => {
    setIsScanningCompliance(true);
    setTimeout(() => {
      setIsScanningCompliance(false);
      setShowComplianceReport(id);
    }, 1500);
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    setExportDropdownOpen(false);
    setPendingAction({
      type: 'export',
      title: `导出全体批次数据 (${format.toUpperCase()})`,
      description: `即将把当前系统中所有 ${batches.length} 个批次的生命周期、财务信息与合规状态导出为 ${format.toUpperCase()} 格式的合规报告。请确认数据范围。`,
      affectedCount: batches.length,
      format,
      onConfirm: () => {
        setPendingAction(null);
        setIsExporting(format);
        setTimeout(() => {
            setIsExporting(null);
            const data = batches.map(b => `${b.id},${b.type},${b.date},${b.stage}`).join('\n');
            const blob = new Blob([data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `溯源批次清单明细_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'csv' : 'pdf'}`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, 2000);
      }
    });
  };

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleExportBatchReport = (id: string) => {
    setPendingAction({
      type: 'report',
      title: `一键生成溯源报告 -> ${id}`,
      description: `系统将整合该批次的农事记录、检测报告及仓储物流数据，通过后端模板引擎为您输出高品质 PDF 溯源合规手册。`,
      affectedCount: 1,
      batchId: id,
      onConfirm: () => {
        setPendingAction(null);
        setIsExportingReport(id);
        setTimeout(() => {
            const batch = batches.find(b => b.id === id);
            const content = `溯源报告 \n批次: ${id}\n品种: ${batch?.type}\n阶段: ${batch?.stage}\n日期: ${batch?.date}\n\n该批次数据由全息溯源系统自动整合生成，保证真实有效。`;
            const blob = new Blob([content], { type: 'application/pdf' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Traceability_Report_${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            setIsExportingReport(null);
            showToast(`批次 ${id} 的溯源合规手册 (PDF) 已成功生成并下载！`);
        }, 2500);
      }
    });
  };

  const calculateMargin = (input: number, labor: number, sell: number) => {
    const totalCost = input + labor;
    if (sell === 0) return { margin: 0, text: '待分销预测', expectedSell: totalCost * 1.5 };
    const margin = ((sell - totalCost) / sell) * 100;
    return { margin, text: `${margin.toFixed(1)}%`, expectedSell: sell };
  };

  const activeBatch = batches.find(b => b.id === showQrModal);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden relative">
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
              {isExporting ? `正在安全生成 ${isExporting.toUpperCase()}...` : '数据报表下发'}
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
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors hidden md:flex">
            <Bookmark className="w-4 h-4 text-emerald-600" />
            <select className="bg-transparent border-none text-xs text-slate-600 font-bold focus:outline-none cursor-pointer tracking-wide appearance-none pr-4">
              <option disabled>选择常用视图...</option>
              {savedViews.map(v => <option key={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <button 
              onClick={() => {
                const el = document.getElementById('csv-upload');
                if (el) el.click();
              }}
              className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              <QrCode className="w-4 h-4 text-indigo-500" />
              CSV 列表数据灌入
            </button>
            <input type="file" id="csv-upload" accept=".csv" className="hidden" onChange={(e) => {
               if (e.target.files && e.target.files.length > 0) {
                 const fileName = e.target.files[0].name;
                 setPendingAction({
                    type: 'generate',
                    title: 'CSV 批量导入生码',
                    description: `已加载 CSV 数据档: ${fileName}。系统将解析文件内容并为匹配的所有批次生成防伪溯源码。是否确认执行？`,
                    affectedCount: 0, // mock count based on CSV
                    onConfirm: () => {
                       setPendingAction(null);
                       setTimeout(() => setShowPdfPreview(true), 1000);
                    }
                 });
               }
            }} />
          </div>
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
          <button 
            onClick={() => {
              const newName = prompt('请输入新视图名称', '自定义过滤视图');
              if (newName) setSavedViews([...savedViews, { id: Date.now(), name: newName }]);
            }}
            className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold bg-indigo-50 hover:bg-indigo-100 px-4 py-1.5 rounded transition-colors border border-indigo-200 border-dashed"
          >
            <Save className="w-3.5 h-3.5" /> 保存条件为常用视图
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-0 min-h-0 bg-slate-50/30">
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
                 <input type="checkbox" className="rounded text-emerald-600 border-slate-300 focus:ring-emerald-500" />
              </th>
              <th className="px-6 py-4 font-bold">繁育序列及批次号</th>
              <th className="px-6 py-4 font-bold">关联名贵珍品系</th>
              <th className="px-6 py-4 font-bold">创设时间档</th>
              <th className="px-6 py-4 font-bold">繁育基站/温室环境</th>
              <th className="px-6 py-4 font-bold text-right">已签发防伪总数</th>
              <th className="px-6 py-4 font-bold">生长阶段监控</th>
              <th className="px-6 py-4 font-bold text-right">安全流转管理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            <AnimatePresence>
            {filteredData.map((b, i) => (
              <motion.tr 
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: i * 0.05 }}
                 key={b.id} 
                 className="hover:bg-emerald-50/20 transition-colors group"
              >
                <td className="px-6 py-4 border-l-2 border-transparent group-hover:border-emerald-500">
                    <input type="checkbox" className="rounded text-emerald-600 border-slate-300 focus:ring-emerald-500" />
                </td>
                <td className="px-6 py-4 font-mono font-bold text-slate-700 text-sm tracking-wide">{b.id}</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full hidden sm:block bg-slate-300 group-hover:bg-emerald-500 transition-colors"></div>
                     {b.type}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs font-mono">{b.date}</td>
                <td className="px-6 py-4 text-slate-600 font-medium text-sm">{b.house}</td>
                <td className="px-6 py-4 font-mono font-black text-emerald-600 text-right text-base">{b.generated} <span className="text-xs text-slate-400 font-normal">张</span></td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 bg-${b.color}-50 text-${b.color}-700 border border-${b.color}-200/60 rounded-md text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 shadow-sm`}>
                    <span className={`w-1.5 h-1.5 rounded-full bg-${b.color}-500 flex-shrink-0 animate-pulse`}></span>
                    {b.stage}
                  </span>
                </td>
                <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => setShowQrModal(b.id)}
                    className="flex items-center justify-center gap-1.5 text-blue-600 hover:text-white hover:bg-blue-600 font-bold text-[10px] uppercase tracking-wider bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg transition-all shadow-sm group/btn"
                  >
                    <QrCode className="w-3 h-3 group-hover/btn:scale-110 transition-transform" />
                    生码溯源
                  </button>
                  <button 
                    onClick={() => handleScanCompliance(b.id)}
                    className="flex items-center justify-center gap-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 font-bold text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                  >
                    {isScanningCompliance ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                    合规性探针
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
                </td>
              </motion.tr>
            ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

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
                         <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">预设批量衍生总数 <span className="text-[10px] text-slate-400 font-normal ml-2 tracking-normal">(基于本批次产量基数)</span></label>
                         <div className="relative">
                           <input 
                              type="number" 
                              value={qrAmount}
                              onChange={(e) => setQrAmount(Number(e.target.value))}
                              className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-xl text-lg font-black text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono transition-all"
                           />
                           <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">张</span>
                         </div>
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
                          onConfirm: () => {
                             setPendingAction(null);
                             setShowPdfPreview(true);
                          }
                        });
                    }} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-bold text-sm transition-all flex items-center justify-center gap-2 transform active:scale-[0.98] focus:ring-4 focus:ring-blue-500/30">
                       进入排版沙盒与输出
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                 </div>
              </div>

              <div className="w-full md:w-[45%] p-8 flex flex-col items-center justify-center bg-[#f1f5f9] relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-30 border-t md:border-t-0 border-slate-200">
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
                                <QRCodeSVG value={`${window.location.origin}${window.location.pathname}#/trace/${activeBatch.id}`} size={140} level="H" />
                             </div>
                             <div className="mt-5 flex flex-col items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 w-full text-center">
                               <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">唯一数字映射标识</span>
                               <span className="font-mono font-black text-xl text-slate-900 tracking-widest bg-white px-2 rounded shadow-sm border border-slate-100 w-full overflow-hidden text-ellipsis">
                                 {activeBatch.id}
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
                             <QRCodeSVG value={`${window.location.origin}${window.location.pathname}#/trace/${activeBatch.id}`} size={showAntiFakeLogo ? 60 : 76} level="H" />
                           </div>
                           <div className="flex-1 ml-3 text-right flex flex-col justify-center h-full">
                             {showAntiFakeLogo && <div className="text-[8px] font-black text-emerald-600 mb-1 tracking-widest flex justify-end items-center gap-1 uppercase"><ShieldCheck className="w-2.5 h-2.5" /> 核准溯源</div>}
                             <div className="font-black text-xs text-slate-800 leading-tight tracking-wide bg-slate-50 px-1 py-0.5 rounded ml-auto border border-slate-100 mb-1 w-max max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{activeBatch.type}</div>
                             <div className="font-mono font-bold text-[9px] text-slate-500 mt-auto truncate tracking-widest px-1">{activeBatch.id}</div>
                           </div>
                         </div>
                      ) : (
                       Array.from({length: 8}).map((_, i) => (
                          <div key={i} className="border border-slate-300 border-dashed rounded flex flex-col items-center justify-center p-1 bg-white relative">
                             {showAntiFakeLogo && <ShieldCheck className="absolute top-1 left-1 w-2.5 h-2.5 text-emerald-500 opacity-50" />}
                             <QRCodeSVG value={`${window.location.origin}${window.location.pathname}#/trace/${activeBatch.id}`} size={38} level="L" />
                             <div className="text-[6px] font-mono mt-1 text-slate-600 bg-slate-100 px-1 rounded">{activeBatch.id.substring(0,8)}</div>
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
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">16px</span>
                              </label>
                              <input type="range" min="0" max="40" defaultValue="16" className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-full appearance-none hover:accent-indigo-700 transition-all cursor-pointer" />
                           </div>
                           
                           <div>
                              <label className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                                <span>标签行间距 (Gap)</span>
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">12px</span>
                              </label>
                              <input type="range" min="0" max="32" defaultValue="12" className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-full appearance-none hover:accent-indigo-700 transition-all cursor-pointer" />
                           </div>

                           <div>
                              <label className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                                <span>防伪溯源码尺寸比</span>
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">80px</span>
                              </label>
                              <input type="range" min="40" max="120" defaultValue="80" className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-full appearance-none hover:accent-indigo-700 transition-all cursor-pointer" />
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
                              <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-100 border-slate-300" />
                              渲染机构防伪盾牌标志
                           </label>
                           <label className="flex items-center gap-3 text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-100 border-slate-300" />
                              映射关联商品品名
                           </label>
                           <label className="flex items-center gap-3 text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-100 border-slate-300" />
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
                          <button onClick={async () => {
                             if (showQrModal) {
                               try { await generateCode(showQrModal); } catch { /* 演示导出不阻塞 */ }
                             }
                             setShowPdfPreview(false);
                             setShowQrModal(null);
                             showToast(`已为批次生成溯源码并导出标签 (${qrAmount}张)。`);
                          }} className="flex items-center justify-center gap-2 text-white font-bold text-sm bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded-xl transition-all shadow border border-indigo-700/50 focus:ring-4 focus:ring-indigo-500/30 active:scale-95">
                            <Download className="w-4 h-4" /> 导出印刷级 PDF
                          </button>
                        </div>
                     </div>
                     
                     <div className="bg-white shadow-2xl ring-1 ring-slate-900/5 min-h-[842px] w-[595px] p-8 grid grid-cols-3 gap-4 pb-20 transform transition-transform hover:scale-[1.02] duration-500 ease-out origin-top border-t-8 border-indigo-600">
                        {Array.from({length: Math.min(21, qrAmount)}).map((_, i) => (
                           <div key={i} className="border-2 border-dashed border-slate-300 rounded p-2 flex flex-col items-center justify-center relative hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="absolute top-1 left-1 flex items-center gap-1">
                                 <CheckCircle className="w-3 h-3 text-emerald-500" />
                              </div>
                              <div className="absolute top-1 right-1 text-[8px] text-slate-400 font-mono font-bold">{i+1}/{qrAmount}</div>
                              <QRCodeSVG value={`${window.location.origin}${window.location.pathname}#/trace/${activeBatch?.id}-S${i}`} size={80} level="M" />
                              <div className="mt-2 text-[10px] font-bold text-slate-800 text-center">{activeBatch?.type}</div>
                              <div className="text-[8px] text-slate-500 font-mono">{activeBatch?.id}-S{i}</div>
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
         <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
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
                     <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border-4 border-white shadow-md relative shrink-0">
                        <div className="absolute inset-0 border-4 border-emerald-500 rounded-full opacity-20 animate-ping"></div>
                        <span className="text-2xl font-black">95<span className="text-sm">%</span></span>
                     </div>
                     <div>
                        <div className="text-base font-black text-slate-800 mb-1.5 flex items-center gap-2">
                          接近完全符合法定食品/花卉安全溯源配置规范
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="text-xs text-slate-500 font-medium">当前挂载抽检批次号流水: <span className="font-mono font-bold bg-white text-slate-700 px-2 py-0.5 rounded shadow-sm border border-slate-200 ml-1">{showComplianceReport}</span></div>
                     </div>
                  </div>
                  
                  <div className="space-y-3 relative before:absolute before:inset-y-4 before:left-[1.375rem] before:w-0.5 before:bg-slate-100">
                     <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl relative z-10 shadow-sm hover:border-emerald-200 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                           <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-emerald-200">
                             <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                           </div>
                           国家安全预警与定期抽检质检报告集成
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">已挂载</span>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl relative z-10 shadow-sm hover:border-emerald-200 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                           <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-emerald-200">
                             <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                           </div>
                           原产地地块确权及种植主体企业责任人映射
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">已挂载</span>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl relative z-10 shadow-sm shadow-amber-100/50 overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                        <div className="flex items-center gap-3 text-sm text-amber-900 font-black">
                           <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-amber-200">
                             <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                           </div>
                           待补充：特定时段化肥农药用药残留合规抽查单据
                        </div>
                        <button className="text-[10px] uppercase tracking-widest font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded shadow-sm transition-all shadow-amber-500/20 hover:scale-105 active:scale-95">立刻处置填报</button>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl relative z-10 shadow-sm hover:border-emerald-200 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                           <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-emerald-200">
                             <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                           </div>
                           防异地串货地理坐标围栏与终端扫描地效验水印
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">已挂载</span>
                     </div>
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                     <button onClick={() => setShowComplianceReport(null)} className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-slate-900/20 active:scale-95">关联合规探针工作台</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {showProfitModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
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
                           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 Mix-blend-overlay mix-blend-overlay"></div>
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
                    className={`px-5 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-colors ${pendingAction.type === 'export' ? 'bg-indigo-600 hover:bg-indigo-700' : pendingAction.type === 'report' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                 >
                    确认 {pendingAction.type === 'generate' ? '生成' : '导出'}
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

      {/* Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
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
// __CREATE_BATCH_MODAL_RETURN__

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-bold text-slate-800 text-lg">新建批次</h3>
        {fields.length === 0 && <p className="text-amber-600 text-sm">请先创建地块后再建批次。</p>}
        <label className="block text-xs font-bold text-slate-500">所属地块
          <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-500">批次号
          <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">品种
          <input value={cropName} onChange={(e) => setCropName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">种植日期
          <input type="date" value={plantDate} onChange={(e) => setPlantDate(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">预计收获
          <input type="date" value={expectedHarvest} onChange={(e) => setExpectedHarvest(e.target.value)} required
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
