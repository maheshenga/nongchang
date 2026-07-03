import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Printer, Search, QrCode, X, Settings2, GripVertical, MapPin, ShieldCheck } from 'lucide-react';
import { Crop } from '../types';
import { useApi } from '../hooks/useApi';
import { listBatches, type Batch } from '../api/batches';
import { generateCodes } from '../api/trace';
import type { AppTab } from '../navigation';

interface MerchantAdminProps {
  onNavigate?: (tab: AppTab) => void;
}

function toCrop(b: Batch): Crop {
  return {
    id: b.id,
    name: b.cropName,
    batchNo: b.batchNo,
    plantDate: b.plantDate.slice(0, 10),
    expectedHarvest: b.expectedHarvest.slice(0, 10),
    qrCodesGenerated: b.codeCount,
    status: b.status as Crop['status'],
  };
}

export default function MerchantAdmin({ onNavigate }: MerchantAdminProps) {
  const { data: rawBatches, loading, error, reload } = useApi(listBatches);
  const crops: Crop[] = (rawBatches ?? []).map(toCrop);
  const [selectedCropIds, setSelectedCropIds] = useState<Set<string>>(new Set());
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // 打印预览时为每个批次真实生成的溯源码:batchId → code。
  const [cropCodes, setCropCodes] = useState<Record<string, string>>({});
  const [generatingPrint, setGeneratingPrint] = useState(false);

  const filteredCrops = crops.filter(crop => 
    crop.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    crop.batchNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    crop.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedCropIds.size === filteredCrops.length && filteredCrops.length > 0) {
      setSelectedCropIds(new Set());
    } else {
      setSelectedCropIds(new Set(filteredCrops.map(c => c.id)));
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const selectedCrops = crops.filter(c => selectedCropIds.has(c.id));
  const activeCrop = selectedCrops.length > 0 ? selectedCrops[selectedCrops.length - 1] : null;

  // 消费者扫码访问的真实溯源页 URL(hash 路由 H5)。
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;

  // 打开打印预览前为每个选中批次真实生成一个溯源码。
  const openPrintPreview = async () => {
    if (selectedCrops.length === 0) return;
    setGeneratingPrint(true);
    try {
      const entries = await Promise.all(
        selectedCrops.map(async (c) => {
          const codes = await generateCodes(c.id, 1);
          return [c.id, codes[0]?.code] as const;
        }),
      );
      setCropCodes(Object.fromEntries(entries.filter(([, code]) => code)));
      setShowPrintPreview(true);
    } catch (e) {
      showToast(e instanceof Error ? `生成溯源码失败:${e.message}` : '生成溯源码失败');
    } finally {
      setGeneratingPrint(false);
    }
  };

  const generateForActiveCrop = async () => {
    if (!activeCrop) return;
    if (!Number.isInteger(qrAmount) || qrAmount < 1 || qrAmount > 10000) {
      showToast('赋码数量需为 1-10000 的整数');
      return;
    }
    setGeneratingPrint(true);
    try {
      const codes = await generateCodes(activeCrop.id, qrAmount);
      const firstCode = codes[0]?.code;
      if (firstCode) setCropCodes((current) => ({ ...current, [activeCrop.id]: firstCode }));
      showToast(`已生成 ${codes.length} 个溯源码`);
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? `生成溯源码失败:${e.message}` : '生成溯源码失败');
    } finally {
      setGeneratingPrint(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedCropIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCropIds(newSet);
  };
  const [qrAmount, setQrAmount] = useState<number>(100);
  
  // H5 Template Editor State
  const [showH5Editor, setShowH5Editor] = useState(false);

  const [abTestMode, setAbTestMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A');

  const [templateBlocksA, setTemplateBlocksA] = useState([
    { id: 'brand_video', name: '品牌宣传视频', enabled: true },
    { id: 'product_info', name: '芍药品种与规格', enabled: true },
    { id: 'trace_timeline', name: '全生命周期溯源轴', enabled: true },
    { id: 'quality_report', name: '权威质检与认证报告', enabled: true },
    { id: 'farmer_word', name: '培育师傅寄语', enabled: true },
    { id: 'consumer_marketing', name: '消费者互动营销 (扫码领积分/抽奖)', enabled: false },
  ]);

  const [templateBlocksB, setTemplateBlocksB] = useState([
    { id: 'consumer_marketing', name: '消费者互动营销 (扫码领积分/抽奖)', enabled: true },
    { id: 'brand_video', name: '品牌宣传视频', enabled: true },
    { id: 'trace_timeline', name: '全生命周期溯源轴', enabled: true },
    { id: 'product_info', name: '芍药品种与规格', enabled: true },
    { id: 'quality_report', name: '权威质检与认证报告', enabled: false },
    { id: 'farmer_word', name: '培育师傅寄语', enabled: false },
  ]);

  const activeBlocks = activeTab === 'A' ? templateBlocksA : templateBlocksB;
  const setActiveBlocks = activeTab === 'A' ? setTemplateBlocksA : setTemplateBlocksB;

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newBlocks = [...activeBlocks];
      [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
      setActiveBlocks(newBlocks);
    } else if (direction === 'down' && index < activeBlocks.length - 1) {
      const newBlocks = [...activeBlocks];
      [newBlocks[index + 1], newBlocks[index]] = [newBlocks[index], newBlocks[index + 1]];
      setActiveBlocks(newBlocks);
    }
  };

  const [draggedItem, setDraggedItem] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (draggedItem === null) return;
    if (draggedItem !== index) {
      const newItems = [...activeBlocks];
      const draggedBlock = newItems[draggedItem];
      newItems.splice(draggedItem, 1);
      newItems.splice(index, 0, draggedBlock);
      setDraggedItem(index);
      setActiveBlocks(newItems);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const toggleBlock = (index: number) => {
    const newBlocks = [...activeBlocks];
    newBlocks[index].enabled = !newBlocks[index].enabled;
    setActiveBlocks(newBlocks);
  };

  return (
    <div className="flex gap-6 h-full">
      {/* List Panel */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索批次或芍药品种..."
                aria-label="搜索批次或芍药品种"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-72 text-slate-700 shadow-sm transition-all"
              />
            </div>
            {selectedCropIds.size > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void openPrintPreview()}
                  disabled={generatingPrint}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  {generatingPrint ? '生成中…' : `打印追溯标签 (${selectedCropIds.size})`}
                </button>
                <button
                  disabled
                  title="模板定制未在当前生产页开放"
                  className="flex items-center gap-2 bg-slate-100 text-slate-400 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold shadow-sm cursor-not-allowed"
                >
                  <Settings2 className="w-4 h-4" />
                  模板定制未开通
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => onNavigate?.('batches')}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            新增芍药繁育生产批次
          </button>
        </div>
        
        <div className="flex-1 overflow-auto">
          {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
          {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[10px] text-slate-500 uppercase bg-slate-50/80 sticky top-0 border-b border-slate-200 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3.5 w-12 font-medium">
                  <input 
                    type="checkbox" 
                    onChange={toggleSelectAll}
                    checked={selectedCropIds.size === filteredCrops.length && filteredCrops.length > 0}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-3.5 font-bold">芍药商品品种/名称</th>
                <th className="px-6 py-3.5 font-bold">源头繁育批次号</th>
                <th className="px-6 py-3.5 font-bold">当前生命周期状态</th>
                <th className="px-6 py-3.5 font-bold">已生成赋码数量</th>
                <th className="px-6 py-3.5 font-bold">产品全链路操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {filteredCrops.map((crop) => (
                <tr key={crop.id} className={`hover:bg-slate-50/50 transition-colors ${selectedCropIds.has(crop.id) ? 'bg-emerald-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      checked={selectedCropIds.has(crop.id)}
                      onChange={() => toggleSelect(crop.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-800 cursor-pointer flex items-center gap-3" onClick={() => toggleSelect(crop.id)}>
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-xs shrink-0">
                      {crop.name.substring(0, 1)}
                    </div>
                    {crop.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs cursor-pointer" onClick={() => toggleSelect(crop.id)}>{crop.batchNo}</td>
                  <td className="px-6 py-4 cursor-pointer" onClick={() => toggleSelect(crop.id)}>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border inline-flex items-center gap-1.5
                      ${crop.status === 'Planting' ? 'bg-orange-50 text-orange-700 border-orange-200' : ''}
                      ${crop.status === 'Growing' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                      ${crop.status === 'Harvested' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                      ${crop.status === 'Distributed' ? 'bg-purple-50 text-purple-700 border-purple-200' : ''}
                    `}>
                      <div className={`w-1.5 h-1.5 rounded-full ${crop.status === 'Planting' ? 'bg-orange-500 animate-pulse' : crop.status === 'Growing' ? 'bg-blue-500 animate-pulse' : crop.status === 'Harvested' ? 'bg-emerald-500' : 'bg-purple-500'}`} />
                      {crop.status === 'Planting' && '组培扩繁中'}
                      {crop.status === 'Growing' && '大棚养护中'}
                      {crop.status === 'Harvested' && '已完成出圃'}
                      {crop.status === 'Distributed' && '已流转终端市场'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-700 text-xs">{crop.qrCodesGenerated.toLocaleString()} 张</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                       <button
                         disabled
                         title="请在批次管理中执行状态流转"
                         className="text-slate-400 font-bold text-[10px] bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg cursor-not-allowed"
                       >
                         到批次管理流转
                       </button>
                       <button
                         onClick={() => setSelectedCropIds(new Set([crop.id]))}
                         className="text-emerald-700 hover:text-white hover:bg-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                       >
                        选择后生成
                      </button>
                      <button
                        disabled
                        title="发货流向绑定未在当前页开放"
                        className="text-indigo-300 font-bold text-[10px] bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg cursor-not-allowed"
                      >
                        发货流向绑定未开通
                      </button>
                      <button className="text-slate-600 hover:text-slate-800 hover:bg-slate-100 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white transition-colors shadow-sm">
                        生命周期追溯档案
                      </button>
                      <button 
                        onClick={() => {
                          window.print();
                        }}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-bold text-[10px] border border-slate-200 bg-white rounded-lg px-3 py-1.5 transition-colors shadow-sm"
                      >
                        <Printer className="w-3 h-3" />
                        出入库单 PDF
                      </button>
                      <button
                        disabled
                        title="请在批次管理中删除批次"
                        className="flex items-center gap-1 text-red-300 font-bold text-[10px] border border-red-100 bg-red-50 rounded-lg px-3 py-1.5 cursor-not-allowed"
                      >
                        到批次管理删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Generation Side Panel */}
      <div className="w-[380px] bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-200 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg">
               <QrCode className="w-4 h-4" />
            </div>
            一物一码追溯赋码管理
          </h3>
          <p className="text-xs text-slate-500 mt-2">系统自动计算赋码批量操作的扣除额度（费用）</p>
        </div>
        
        {activeCrop ? (
          <div className="p-6 flex-1 overflow-auto space-y-6">
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 shadow-sm">
              <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest">当前发码目标档案</p>
              <h4 className="font-bold text-emerald-900 mt-1 flex items-center justify-between text-sm">
                <span>{activeCrop.name}</span>
                <span className="font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg text-xs">{activeCrop.batchNo}</span>
              </h4>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block tracking-wide text-xs font-bold text-slate-700 mb-2">本次批量生成云端溯源标签数量 (枚)</label>
                <input 
                  type="number" 
                  value={qrAmount}
                  onChange={(e) => setQrAmount(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-inner bg-slate-50/50"
                />
              </div>

              {/* Added batch spec fields */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                 <p className="text-xs font-bold text-slate-700">配置溯源标签自定义批次规格</p>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] text-slate-500 mb-1.5 font-bold">源头温室棚室标识</label>
                     <input type="text" placeholder="如: 高山A区" className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                   </div>
                   <div>
                     <label className="block text-[10px] text-slate-500 mb-1.5 font-bold">花卉品种品系级别</label>
                     <input type="text" placeholder="如: 特级孤品" className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                   </div>
                 </div>
              </div>

              <div className="bg-white border text-center border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center space-y-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
                <div className="bg-white p-2.5 border border-slate-100 rounded-xl shadow-md transform hover:scale-105 transition-transform">
                  <QRCodeSVG value={traceUrl(`${activeCrop.batchNo}-样例`)} size={120} />
                </div>
                <p className="text-xs text-center text-slate-500 leading-relaxed font-medium">预览专属赋码样式: <br/>自动注入地理标志与全网唯一身份序列号</p>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex justify-between items-center mb-5 bg-red-50 p-3.5 rounded-xl border border-red-100">
                  <span className="text-xs font-bold text-slate-700">平台系统预计扣除额度</span>
                  <span className="font-mono font-black text-red-600 text-base">¥ {(qrAmount * 0.05).toFixed(2)}</span>
                </div>
                <button
                  onClick={() => void generateForActiveCrop()}
                  disabled={generatingPrint}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-emerald-600/20 flex items-center justify-center gap-2 focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  {generatingPrint ? '生成中...' : '生成溯源码'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-slate-400 p-8 text-center bg-slate-50/30 rounded-b-2xl">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <QrCode className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">请优先在左侧平台勾选批次档案<br/><span className="text-xs text-slate-400 mt-2 block">系统将于本侧边栏激活对应的生成溯源二维码与智能标签控制面板。</span></p>
          </div>
        )}
      </div>

      {/* H5 Template Editor Modal */}
      {showH5Editor && (
        <div role="dialog" aria-modal="true" aria-label="溯源H5页面模板定制" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm shadow-xl">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col md:flex-row">
            <div className="w-full md:w-[60%] p-6 bg-slate-50 border-r border-slate-200 overflow-y-auto flex flex-col">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-purple-600" /> 溯源H5页面模板定制
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">支持拖拽组件调整展示顺序，一键生成品牌专属体验</p>
                </div>
                <button onClick={() => setShowH5Editor(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 md:hidden">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* AB Testing Controls */}
              <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-700 text-sm">页面多版本 A/B 测试对比</h4>
                    <p className="text-xs text-slate-500">发布两套不同排版的H5模板供消费者随机访问，通过数据决出更优版</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={abTestMode} onChange={(e) => setAbTestMode(e.target.checked)} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                
                {abTestMode && (
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button 
                        onClick={() => setActiveTab('A')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'A' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        版本 A (主发)
                      </button>
                      <button 
                        onClick={() => setActiveTab('B')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'B' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        版本 B (测试)
                      </button>
                    </div>
                    
                    <div className="flex-1 flex gap-3 text-[10px] bg-purple-50 p-2 rounded text-purple-800 border border-purple-100 justify-around">
                       <div className="text-center"><div>扫码转化率预估</div><div className="font-bold text-sm">A: 12.4% / B: 15.2%</div></div>
                       <div className="text-center"><div>页面停留时长平均</div><div className="font-bold text-sm">A: 45s / B: 82s</div></div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-3 flex-1 overflow-auto">
                {activeBlocks.map((block, index) => (
                   <div 
                     key={block.id} 
                     draggable
                     onDragStart={(e) => handleDragStart(e, index)}
                     onDragEnter={(e) => handleDragEnter(e, index)}
                     onDragEnd={handleDragEnd}
                     onDragOver={(e) => e.preventDefault()}
                     className={`p-4 bg-white border ${block.enabled ? 'border-purple-200 shadow-sm' : 'border-slate-200 opacity-60'} rounded-xl flex items-center justify-between transition-colors ${draggedItem === index ? 'opacity-50 scale-95' : 'scale-100'} cursor-grab active:cursor-grabbing hover:border-purple-300 transform duration-150`}
                   >
                     <div className="flex items-center gap-4">
                       <GripVertical className="w-5 h-5 text-slate-300" />
                       <input 
                         type="checkbox" 
                         checked={block.enabled} 
                         onChange={() => toggleBlock(index)}
                         className="rounded text-purple-600 border-slate-300 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                       />
                       <span className={`font-bold ${block.enabled ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{block.name}</span>
                     </div>
                     <div className="flex flex-col gap-1">
                       <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} aria-label="上移" className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer">▲</button>
                       <button onClick={() => moveBlock(index, 'down')} disabled={index === activeBlocks.length - 1} aria-label="下移" className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer">▼</button>
                     </div>
                   </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200 shrink-0">
                <button 
                  onClick={() => setShowH5Editor(false)}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-md transition-colors text-sm"
                >
                  保存并发布 {abTestMode ? 'A/B 测试方案' : '模板配置'}
                </button>
              </div>
            </div>
            
            <div className="w-full md:w-[40%] bg-slate-200 flex items-center justify-center relative p-4 h-full hidden md:flex">
               <button onClick={() => setShowH5Editor(false)} aria-label="关闭" className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-white/50 p-1 rounded-full backdrop-blur-sm z-10">
                  <X className="w-5 h-5" />
               </button>
               {/* Mobile Preview Frame */}
               <div className="w-[300px] h-[600px] bg-white rounded-[2.5rem] border-[12px] border-slate-800 shadow-2xl overflow-hidden flex flex-col relative transition-all duration-300">
                 {abTestMode && <div className="absolute top-8 right-2 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-l-full shadow-lg z-20 shadow-purple-500/50 flex items-center gap-1">预览版本 {activeTab}</div>}
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-b-2xl z-10"></div>
                 <div className="bg-emerald-600 pt-10 pb-4 px-4 text-center text-white shrink-0 shadow-sm relative z-0">
                    <h4 className="font-bold tracking-widest text-sm mb-1">防伪溯源验证</h4>
                    <p className="text-[10px] text-emerald-200 opacity-80">溯源档案生成示例预览</p>
                 </div>
                 <div className="flex-1 overflow-y-auto bg-slate-50 p-3 space-y-4 pb-10">
                    {activeBlocks.filter(b => b.enabled).map(block => (
                      <div key={block.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 animate-in slide-in-from-bottom flex flex-col items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-slate-100 text-slate-400 text-[8px] px-1.5 py-0.5 rounded-bl-lg mix-blend-multiply">{block.id}</div>
                        <span className="text-xs font-bold text-slate-700 w-full mb-3 pb-2 border-b border-slate-50 flex items-center gap-1.5">{block.name}</span>
                        {block.id === 'consumer_marketing' ? (
                           <div className="w-full bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-100 text-center p-3 animate-pulse">
                              <h5 className="text-orange-600 font-bold text-sm mb-1">🎁 扫码抽免费赏花游</h5>
                              <p className="text-[10px] text-orange-500">点击参与互动营销活动，获取积分或大奖</p>
                              <button className="mt-2 text-white bg-gradient-to-r from-orange-500 to-red-500 px-3 py-1.5 text-xs rounded-full shadow-md w-full font-bold">立即领取</button>
                           </div>
                        ) : block.id === 'brand_video' ? (
                           <div className="w-full h-32 bg-slate-800 rounded-lg relative flex items-center justify-center shadow-inner overflow-hidden">
                              <div className="absolute inset-0 opacity-60 bg-cover bg-center" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(16,185,129,0.5), transparent 60%), linear-gradient(135deg, #1e293b, #334155)' }}></div>
                              <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur border border-white/50 flex items-center justify-center z-10">
                                <div className="w-0 h-0 border-l-[10px] border-l-white border-y-[6px] border-y-transparent ml-1"></div>
                              </div>
                           </div>
                        ) : block.id === 'product_info' ? (
                           <div className="w-full space-y-2">
                              <div className="flex gap-3 items-center">
                                 <div className="w-12 h-12 rounded bg-emerald-100 flex items-center justify-center shrink-0">
                                   <MapPin className="w-5 h-5 text-emerald-600" />
                                 </div>
                                 <div>
                                   <div className="text-xs font-bold text-slate-800">极品春白芍大雪素</div>
                                   <div className="text-[9px] text-slate-500 mt-0.5">规格: A级多头 / 产地: 云南大理</div>
                                 </div>
                              </div>
                           </div>
                        ) : block.id === 'trace_timeline' ? (
                           <div className="w-full pl-2 space-y-3 relative">
                              <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-emerald-100"></div>
                              <div className="relative flex gap-3 text-[10px]">
                                <div className="w-3 h-3 bg-emerald-500 rounded-full shrink-0 z-10 border-2 border-white shadow-sm mt-0.5"></div>
                                <div>
                                  <div className="font-bold text-slate-800">物流派送中</div>
                                  <div className="text-slate-400">2026-06-08 09:30 江苏南京</div>
                                </div>
                              </div>
                              <div className="relative flex gap-3 text-[10px]">
                                <div className="w-3 h-3 bg-slate-300 rounded-full shrink-0 z-10 border-2 border-white shadow-sm mt-0.5"></div>
                                <div>
                                  <div className="font-bold text-slate-600">完成质检出库</div>
                                  <div className="text-slate-400">2026-06-06 14:20 基地冷链中心</div>
                                </div>
                              </div>
                           </div>
                        ) : (
                           <div className="w-full h-16 bg-slate-50 rounded border border-slate-100 border-dashed flex items-center justify-center">
                              <span className="text-slate-400 text-[10px] font-medium tracking-wide">自动拉取商品数据并渲染</span>
                           </div>
                        )}
                      </div>
                    ))}
                    {activeBlocks.filter(b => b.enabled).length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs space-y-2 opacity-50">
                         <QrCode className="w-8 h-8" />
                         <p>未启用任何展示模块</p>
                      </div>
                    )}
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {showPrintPreview && (
        <div role="dialog" aria-modal="true" aria-label="物流热敏打印机联机预览" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Printer className="w-5 h-5" /> 
                </div>
                物流热敏打印机联机预览 (4x6寸)
              </h3>
              <button onClick={() => setShowPrintPreview(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 flex-1 overflow-y-auto bg-slate-100/50 flex flex-col items-center gap-8">
               <p className="text-sm font-medium text-slate-500 mb-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">已成功读取 {selectedCrops.length} 个批次数据，将为每份档案生成高可用溯源标签。</p>
               {selectedCrops.map(crop => (
                 <div key={crop.id} className="w-[400px] h-[600px] bg-white shadow-xl border border-slate-200 rounded p-8 flex flex-col relative scale-[0.85] sm:scale-100 origin-top">
                   <div className="text-center border-b-[3px] border-slate-800 pb-5 mb-6">
                      <h1 className="text-3xl font-black text-slate-900 tracking-widest">官方溯源认证</h1>
                      <h2 className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-wide">PREMIUM PEONY VERIFICATION</h2>
                   </div>
                   
                   <div className="flex justify-between items-center mb-8">
                      <div className="bg-white p-2 border-2 border-slate-100 rounded-xl shadow-sm">
                        <QRCodeSVG value={traceUrl(cropCodes[crop.id] ?? crop.batchNo)} size={120} level="H" />
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">内部流转序列</div>
                        <div className="text-3xl font-black font-mono text-slate-900 mt-1">{crop.batchNo.split('-').pop()}</div>
                        <div className="text-xs text-slate-400 mt-3 font-bold uppercase tracking-wider">全局防伪编码</div>
                        <div className="text-sm font-bold font-mono text-slate-700 mt-1 bg-slate-100 px-2 py-0.5 rounded">{cropCodes[crop.id] ?? crop.batchNo}</div>
                      </div>
                   </div>

                   <table className="w-full text-sm text-left mb-6 border-collapse">
                     <tbody>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold w-1/3">品种品系</th>
                         <td className="py-3 text-slate-900 font-black text-lg">{crop.name}</td>
                       </tr>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold">源头产地</th>
                         <td className="py-3 text-slate-800 font-bold">中国·云南大理培育基地</td>
                       </tr>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold">组培出库期</th>
                         <td className="py-3 text-slate-800 font-mono font-bold">{crop.plantDate}</td>
                       </tr>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold">权威质检</th>
                         <td className="py-3 font-black text-lg text-emerald-600 flex items-center gap-2 uppercase"><ShieldCheck className="w-5 h-5"/> PASSED</td>
                       </tr>
                     </tbody>
                   </table>

                   <div className="mt-auto pt-5 border-t-[3px] border-slate-800 text-center text-xs text-slate-400 uppercase font-bold tracking-widest leading-relaxed">
                     <p>Scan to verify authenticity via zero-knowledge proof</p>
                     <p className="mt-2 font-mono text-slate-300">{Date.now().toString(16).toUpperCase()}-OAUTH-OK</p>
                   </div>
                 </div>
               ))}
            </div>
            <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
               <button onClick={() => setShowPrintPreview(false)} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">放弃打印</button>
               <button onClick={() => {
                 window.print();
                 setShowPrintPreview(false);
               }} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-sm flex items-center gap-2 focus:ring-4 focus:ring-blue-500/20">
                 <Printer className="w-4 h-4"/> 连接打印机执行批量出单
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
