import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Printer, Search, QrCode, X, ShieldCheck } from 'lucide-react';
import { Crop } from '../types';
import { useApi } from '../hooks/useApi';
import { listBatches, type Batch } from '../api/batches';
import { createTraceGenerationRequestKey, generateCodes } from '../api/trace';
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
  const generationRequestKeys = useRef<Record<string, string>>({});

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
  const getGenerationRequestKey = (source: string, batchId: string, count: number) => {
    const operationKey = `${source}:${batchId}:${count}`;
    generationRequestKeys.current[operationKey] ??= createTraceGenerationRequestKey(source, batchId, count);
    return generationRequestKeys.current[operationKey];
  };
  const clearGenerationRequestKey = (source: string, batchId: string, count: number) => {
    delete generationRequestKeys.current[`${source}:${batchId}:${count}`];
  };

  // 消费者扫码访问的真实溯源页 URL(hash 路由 H5)。
  const traceUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/trace/${code}`;
  const statusLabel = (status: Crop['status']) => {
    if (status === 'Planting') return '组培扩繁中';
    if (status === 'Growing') return '大棚养护中';
    if (status === 'Harvested') return '已完成出圃';
    if (status === 'Distributed') return '已流转终端市场';
    return status;
  };

  // 打开打印预览前为每个选中批次真实生成一个溯源码。
  const openPrintPreview = async () => {
    if (selectedCrops.length === 0) return;
    setGeneratingPrint(true);
    try {
      const entries = await Promise.all(
        selectedCrops.map(async (c) => {
          const requestKey = getGenerationRequestKey('merchant-print', c.id, 1);
          const codes = await generateCodes(c.id, 1, requestKey);
          return [c.id, codes[0]?.code] as const;
        }),
      );
      setCropCodes(Object.fromEntries(entries.filter(([, code]) => code)));
      selectedCrops.forEach((c) => clearGenerationRequestKey('merchant-print', c.id, 1));
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
      const requestKey = getGenerationRequestKey('merchant-side-panel', activeCrop.id, qrAmount);
      const codes = await generateCodes(activeCrop.id, qrAmount, requestKey);
      const firstCode = codes[0]?.code;
      if (firstCode) setCropCodes((current) => ({ ...current, [activeCrop.id]: firstCode }));
      showToast(`已生成 ${codes.length} 个溯源码`);
      await reload();
      clearGenerationRequestKey('merchant-side-panel', activeCrop.id, qrAmount);
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
                         onClick={() => setSelectedCropIds(new Set([crop.id]))}
                         className="text-emerald-700 hover:text-white hover:bg-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                       >
                        选择后生成
                      </button>
                      <span className="max-w-[280px] whitespace-normal text-[10px] leading-4 text-slate-500">
                        批次状态流转、发货流向、出入库单和完整追溯档案请在批次管理中处理。
                      </span>
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
          <p className="text-xs text-slate-500 mt-2">按服务端实际生成数量扣除二维码额度。</p>
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

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-700">标签数据来源</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  打印标签仅使用当前批次资料和服务端生成的溯源码。未接入的营销、质检或加密证明能力不会出现在生产标签中。
                </p>
              </div>

              <div className="bg-white border text-center border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center space-y-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
                <div className="bg-white p-2.5 border border-slate-100 rounded-xl shadow-md transform hover:scale-105 transition-transform">
                  <QRCodeSVG value={traceUrl(cropCodes[activeCrop.id] ?? activeCrop.batchNo)} size={120} />
                </div>
                <p className="text-xs text-center text-slate-500 leading-relaxed font-medium">
                  {cropCodes[activeCrop.id]
                    ? '已生成真实溯源码，可打印或扫码验证。'
                    : '选择数量并生成后，二维码将指向真实溯源码。'}
                </p>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex justify-between items-center mb-5 bg-red-50 p-3.5 rounded-xl border border-red-100">
                  <span className="text-xs font-bold text-slate-700">预计扣除二维码额度</span>
                  <span className="font-mono font-black text-red-600 text-base">{Number.isFinite(qrAmount) ? qrAmount : 0} 个</span>
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
            <p className="text-sm font-medium text-slate-500">请优先在左侧平台勾选批次档案<br/><span className="text-xs text-slate-400 mt-2 block">系统将于本侧边栏激活对应的溯源码生成与标签预览面板。</span></p>
          </div>
        )}
      </div>

      {showPrintPreview && (
        <div role="dialog" aria-modal="true" aria-label="溯源码标签打印预览" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Printer className="w-5 h-5" /> 
                </div>
                溯源码标签打印预览 (4x6寸)
              </h3>
              <button onClick={() => setShowPrintPreview(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 flex-1 overflow-y-auto bg-slate-100/50 flex flex-col items-center gap-8">
               <p className="text-sm font-medium text-slate-500 mb-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">已成功生成 {selectedCrops.length} 个批次的溯源码，可打印真实标签。</p>
               {selectedCrops.map(crop => (
                 <div key={crop.id} className="w-[400px] h-[600px] bg-white shadow-xl border border-slate-200 rounded p-8 flex flex-col relative scale-[0.85] sm:scale-100 origin-top">
                   <div className="text-center border-b-[3px] border-slate-800 pb-5 mb-6">
                      <h1 className="text-3xl font-black text-slate-900 tracking-widest">溯源码标签</h1>
                      <h2 className="text-sm font-bold text-slate-500 mt-2">扫码查看该批次已登记的溯源信息</h2>
                   </div>
                   
                   <div className="flex justify-between items-center mb-8">
                      <div className="bg-white p-2 border-2 border-slate-100 rounded-xl shadow-sm">
                        <QRCodeSVG value={traceUrl(cropCodes[crop.id] ?? crop.batchNo)} size={120} level="H" />
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold tracking-wider">批次号</div>
                        <div className="text-2xl font-black font-mono text-slate-900 mt-1">{crop.batchNo}</div>
                        <div className="text-xs text-slate-400 mt-3 font-bold tracking-wider">溯源码</div>
                        <div className="text-sm font-bold font-mono text-slate-700 mt-1 bg-slate-100 px-2 py-0.5 rounded">{cropCodes[crop.id] ?? crop.batchNo}</div>
                      </div>
                   </div>

                   <table className="w-full text-sm text-left mb-6 border-collapse">
                     <tbody>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold w-1/3">作物名称</th>
                         <td className="py-3 text-slate-900 font-black text-lg">{crop.name}</td>
                       </tr>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold">批次号</th>
                         <td className="py-3 text-slate-800 font-mono font-bold">{crop.batchNo}</td>
                       </tr>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold">种植日期</th>
                         <td className="py-3 text-slate-800 font-mono font-bold">{crop.plantDate}</td>
                       </tr>
                       <tr className="border-b border-dashed border-slate-200">
                         <th className="py-3 text-slate-500 font-bold">当前状态</th>
                         <td className="py-3 text-slate-800 font-bold">{statusLabel(crop.status)}</td>
                       </tr>
                     </tbody>
                   </table>

                    <div className="mt-auto pt-5 border-t-[3px] border-slate-800 text-center text-xs text-slate-500 font-bold tracking-widest leading-relaxed">
                     <p>扫码进入公开溯源页</p>
                     <p className="mt-2 font-mono text-slate-500">{cropCodes[crop.id] ?? crop.batchNo}</p>
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
                  <Printer className="w-4 h-4"/> 打印当前页面
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
