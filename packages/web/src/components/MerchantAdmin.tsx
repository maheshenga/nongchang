import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Download, Printer, Search, QrCode, X, Settings2, GripVertical, BarChart, MapPin, ShieldCheck, Map, ScanLine } from 'lucide-react';
import { Crop } from '../types';

const MOCK_CROPS: Crop[] = [
  { id: 'O001', name: '极品春白芍大雪素', batchNo: 'OB-2023-11', plantDate: '2023-04-12', expectedHarvest: '2025-11-20', qrCodesGenerated: 500, status: 'Harvested' },
  { id: 'O002', name: '素心紫凤朝阳', batchNo: 'OB-2023-05', plantDate: '2023-05-01', expectedHarvest: '2025-09-30', qrCodesGenerated: 1200, status: 'Distributed' },
  { id: 'O003', name: '紫秀冠世墨玉', batchNo: 'OB-2024-01', plantDate: '2024-01-10', expectedHarvest: '2026-03-15', qrCodesGenerated: 0, status: 'Planting' },
  { id: 'O004', name: '朱砂判仙客', batchNo: 'OB-2024-03', plantDate: '2024-03-01', expectedHarvest: '2026-04-20', qrCodesGenerated: 200, status: 'Growing' },
];

export default function MerchantAdmin() {
  const [crops, setCrops] = useState<Crop[]>(() => {
    const saved = localStorage.getItem('system_batches');
    if (saved) {
      try {
        const batches = JSON.parse(saved);
        return batches.map((b: any) => ({
          id: 'O' + (b.id.replace(/[^0-9]/g, '').slice(-3) || '000'),
          name: b.type,
          batchNo: b.id,
          plantDate: b.date,
          expectedHarvest: '2026-11-20',
          qrCodesGenerated: b.generated || 0,
          status: b.stage === '已出圃' ? 'Distributed' : b.stage === '休眠促花' ? 'Harvested' : 'Growing'
        }));
      } catch (e) {}
    }
    return MOCK_CROPS;
  });

  useEffect(() => {
    const handleSync = () => {
      const saved = localStorage.getItem('system_batches');
      if (saved) {
        try {
          const batches = JSON.parse(saved);
          setCrops(batches.map((b: any) => ({
            id: 'O' + (b.id.replace(/[^0-9]/g, '').slice(-3) || '000'),
            name: b.type,
            batchNo: b.id,
            plantDate: b.date,
            expectedHarvest: '2026-11-20',
            qrCodesGenerated: b.generated || 0,
            status: b.stage === '已出圃' ? 'Distributed' : b.stage === '休眠促花' ? 'Harvested' : 'Growing'
          })));
        } catch(e) {}
      }
    };
    window.addEventListener('batches-updated', handleSync);
    return () => window.removeEventListener('batches-updated', handleSync);
  }, []);
  const [selectedCropIds, setSelectedCropIds] = useState<Set<string>>(new Set());
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isProcessingRfid, setIsProcessingRfid] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Still keeping selectedCrop for the side panel logic if needed, 
  // or use the last one from the set. Let's adapt it.
  const selectedCrops = crops.filter(c => selectedCropIds.has(c.id));
  const activeCrop = selectedCrops.length > 0 ? selectedCrops[selectedCrops.length - 1] : null;

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
  const [showScanInsights, setShowScanInsights] = useState(false);
  const [showRfidModal, setShowRfidModal] = useState<string | null>(null);
  
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

  const handleCreateCrop = () => {
    const newCrop: Crop = {
      id: `O${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      name: ['粉玉奴', '杨妃出浴', '大富贵', '奇花霜露'][Math.floor(Math.random() * 4)],
      batchNo: `OB-2026-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      plantDate: new Date().toISOString().split('T')[0],
      expectedHarvest: '2028-05-01',
      qrCodesGenerated: 0,
      status: 'Planting'
    };
    setCrops([newCrop, ...crops]);
    showToast(`已成功增开系统生产批次：${newCrop.batchNo}`);
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-72 text-slate-700 shadow-sm transition-all"
              />
            </div>
            {selectedCropIds.size > 0 && (
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setShowPrintPreview(true)}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  打印追溯标签 ({selectedCropIds.size})
                </button>
                <button 
                  onClick={() => setShowH5Editor(true)}
                  className="flex items-center gap-2 bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Settings2 className="w-4 h-4" />
                  定制专属溯源模板
                </button>
                <button 
                  onClick={() => setShowScanInsights(true)}
                  className="flex items-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <BarChart className="w-4 h-4" />
                  防伪与消费者洞察
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={handleCreateCrop}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            新增芍药繁育生产批次
          </button>
        </div>
        
        <div className="flex-1 overflow-auto">
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
                         onClick={() => {
                            const statuses: any = { 'Planting': 'Growing', 'Growing': 'Harvested', 'Harvested': 'Distributed' };
                            const next = statuses[crop.status];
                            if (next) {
                               setCrops(crops.map(c => c.id === crop.id ? { ...c, status: next } : c));
                               showToast(`批次 ${crop.batchNo} 状态已更新为：${next === 'Growing' ? '大棚养护' : next === 'Harvested' ? '已出圃' : '已流转终端'}`);
                            }
                         }}
                         disabled={crop.status === 'Distributed'}
                         className="text-slate-600 hover:text-white hover:bg-slate-800 font-bold text-[10px] bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                       >
                         进入下一阶段
                       </button>
                       <button className="text-emerald-700 hover:text-white hover:bg-emerald-600 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                        生成赋码
                      </button>
                      <button className="text-indigo-700 hover:text-white hover:bg-indigo-600 font-bold text-[10px] bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                        发货流向绑定 <span className="font-normal opacity-70 ml-0.5">(防窜货)</span>
                      </button>
                      <button 
                        onClick={() => setShowRfidModal(crop.id)}
                        className="text-amber-700 hover:text-white hover:bg-amber-600 font-bold text-[10px] bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-sm"
                      >
                        <ScanLine className="w-3 h-3" /> 智能芯片绑定
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
                        onClick={() => {
                          const conf = window.confirm('确认删除该批次所有数据？此操作不可撤销。');
                          if (conf) {
                            setCrops(crops.filter(c => c.id !== crop.id));
                            setSelectedCropIds(prev => {
                              const newSel = new Set(prev);
                              newSel.delete(crop.id);
                              return newSel;
                            });
                            showToast('生产批次已成功删除');
                          }
                        }}
                        className="flex items-center gap-1 text-red-600 hover:text-white hover:bg-red-600 font-bold text-[10px] border border-red-200 bg-red-50 rounded-lg px-3 py-1.5 transition-colors shadow-sm"
                      >
                        注销批次
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
                  <QRCodeSVG value={`https://agritrace.app/t/${activeCrop.batchNo}-preview`} size={120} />
                </div>
                <p className="text-xs text-center text-slate-500 leading-relaxed font-medium">预览专属赋码样式: <br/>自动注入地理标志与全网唯一身份序列号</p>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex justify-between items-center mb-5 bg-red-50 p-3.5 rounded-xl border border-red-100">
                  <span className="text-xs font-bold text-slate-700">平台系统预计扣除额度</span>
                  <span className="font-mono font-black text-red-600 text-base">¥ {(qrAmount * 0.05).toFixed(2)}</span>
                </div>
                <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-emerald-600/20 flex items-center justify-center gap-2 focus:ring-4 focus:ring-emerald-500/30">
                  <Printer className="w-4 h-4" />
                  确认赋码操作并导出打印文件
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm shadow-xl">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col md:flex-row">
            <div className="w-full md:w-[60%] p-6 bg-slate-50 border-r border-slate-200 overflow-y-auto flex flex-col">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-purple-600" /> 溯源H5页面模板定制
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">支持拖拽组件调整展示顺序，一键生成品牌专属体验</p>
                </div>
                <button onClick={() => setShowH5Editor(false)} className="text-slate-400 hover:text-slate-600 md:hidden">
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
                       <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer">▲</button>
                       <button onClick={() => moveBlock(index, 'down')} disabled={index === activeBlocks.length - 1} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer">▼</button>
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
               <button onClick={() => setShowH5Editor(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-white/50 p-1 rounded-full backdrop-blur-sm z-10">
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
                              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1590459526702-8a9d1d6a89c3?auto=format&fit=crop&q=80&w=400')] bg-cover bg-center opacity-60"></div>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Printer className="w-5 h-5" /> 
                </div>
                物流热敏打印机联机预览 (4x6寸)
              </h3>
              <button onClick={() => setShowPrintPreview(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
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
                        <QRCodeSVG value={`https://agritrace.app/t/${crop.batchNo}-${Date.now()}`} size={120} level="H" />
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">内部流转序列</div>
                        <div className="text-3xl font-black font-mono text-slate-900 mt-1">{crop.batchNo.split('-').pop()}</div>
                        <div className="text-xs text-slate-400 mt-3 font-bold uppercase tracking-wider">全局防伪编码</div>
                        <div className="text-sm font-bold font-mono text-slate-700 mt-1 bg-slate-100 px-2 py-0.5 rounded">{crop.batchNo}</div>
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

      {/* Consumer Insights & Anti-fake Analytics Modal */}
      {showScanInsights && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm shadow-xl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center p-6 border-b border-orange-100 bg-orange-50/80 shrink-0">
               <div>
                 <h3 className="font-bold text-orange-900 text-lg flex items-center gap-3">
                   <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                     <ShieldCheck className="w-5 h-5" /> 
                   </div>
                   防伪扫码监控与终端消费者洞察
                 </h3>
                 <p className="text-xs text-orange-700/80 mt-1.5 tracking-wide">基于真实扫码记录的大数据分析、留存转化率与防窜货预警网</p>
               </div>
               <button onClick={() => setShowScanInsights(false)} className="text-orange-900/40 hover:text-orange-900 hover:bg-orange-100/50 p-2 rounded-lg transition-colors">
                 <X className="w-5 h-5" />
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-1/3 flex flex-col gap-6">
                   <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                      <div className="text-sm font-bold text-slate-800 mb-5 flex items-center gap-2">
                        <BarChart className="w-4 h-4 text-slate-400"/> 数据大盘总览 <span className="text-[10px] font-normal text-slate-400 ml-auto bg-slate-100 px-2 py-0.5 rounded-full">近 30 天</span>
                      </div>
                      <div className="space-y-5">
                        <div className="flex justify-between items-end border-b border-slate-100/60 pb-3 hover:bg-slate-50/30 transition-colors rounded-lg px-2 -mx-2">
                           <div className="text-xs font-bold text-slate-500">累计有效端点扫码量</div>
                           <div className="text-2xl font-black font-mono text-slate-800">14,208 <span className="text-sm text-slate-400 font-normal">次</span></div>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-100/60 pb-3 hover:bg-slate-50/30 transition-colors rounded-lg px-2 -mx-2">
                           <div className="text-xs font-bold text-slate-500">留存独立消费者 (UV)</div>
                           <div className="text-2xl font-black font-mono text-slate-800">9,852 <span className="text-sm text-slate-400 font-normal">人</span></div>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-100/60 pb-3 hover:bg-red-50/30 transition-colors rounded-lg px-2 -mx-2">
                           <div className="text-xs font-bold text-slate-500">异常扫码阻断拦截 (疑似仿冒)</div>
                           <div className="text-xl font-black font-mono text-red-600 bg-red-50 px-2 py-1 rounded-lg">42 <span className="text-xs text-red-400 font-normal">次</span></div>
                        </div>
                        <div className="flex justify-between items-end pb-1 hover:bg-emerald-50/30 transition-colors rounded-lg px-2 -mx-2">
                           <div className="text-xs font-bold text-slate-500">端内复购链路转化率</div>
                           <div className="text-xl font-black font-mono text-emerald-600">8.4%</div>
                        </div>
                      </div>
                   </div>

                   <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col">
                      <div className="text-sm font-bold text-slate-800 mb-5 flex justify-between items-center">
                        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-red-500"/> 异常防伪安全预警</span>
                        <button className="text-[10px] text-slate-400 hover:text-slate-600 font-medium">查看全部日志</button>
                      </div>
                      <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                         <div className="bg-gradient-to-r from-red-50 to-white border border-red-100 p-4 rounded-xl text-xs flex justify-between items-start group hover:border-red-200 transition-all">
                           <div>
                             <div className="font-bold text-red-800 flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>同一序列号异地并发扫码</div>
                             <div className="text-red-500/80 mt-1.5 font-mono bg-red-100/50 inline-block px-1.5 py-0.5 rounded text-[10px]">序列: 8A9B-CC2-11</div>
                           </div>
                           <button className="bg-white text-red-600 px-3 py-1.5 rounded-lg shadow-sm font-bold border border-red-100 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">一键冻结</button>
                         </div>
                         <div className="bg-gradient-to-r from-amber-50 to-white border border-amber-100 p-4 rounded-xl text-xs flex justify-between items-start group hover:border-amber-200 transition-all">
                           <div>
                             <div className="font-bold text-amber-800 flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>终端设备高频重复调阅</div>
                             <div className="text-amber-600/80 mt-1.5 tracking-wide">单 IP 地址 1 小时内触发 50 次</div>
                           </div>
                           <button className="bg-white text-amber-700 px-3 py-1.5 rounded-lg shadow-sm font-bold border border-amber-100 hover:bg-amber-50 transition-colors opacity-0 group-hover:opacity-100">查看画像</button>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="flex-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden group">
                   <div className="text-sm font-bold text-slate-800 mb-5 flex items-center justify-between relative z-10 w-full">
                     <span className="flex items-center gap-2"><Map className="w-4 h-4 text-blue-600" /> 消费者扫码终端地理位置热力图</span>
                     <div className="flex items-center gap-2">
                       <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="w-2 h-2 rounded-full bg-red-400"></div>高热度</span>
                       <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="w-2 h-2 rounded-full bg-amber-400"></div>中度激活</span>
                     </div>
                   </div>
                   <div className="flex-1 bg-slate-50 rounded-xl relative overflow-hidden flex items-center justify-center flex-col border border-slate-100 shadow-inner group-hover:bg-slate-100 transition-colors duration-500">
                      <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')] mix-blend-multiply pointer-events-none"></div>
                      <MapPin className="w-16 h-16 text-blue-200 mb-4 drop-shadow-md transform group-hover:scale-110 transition-transform duration-700" />
                      <p className="font-bold text-slate-400 z-10 text-center tracking-wide leading-relaxed">系统已检测到主产区外高活跃度终端：<br/><span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">上海市</span> 、 <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">江苏省</span> 、 <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">广东省</span></p>
                      
                      {/* Fake Heatmap dots */}
                      <div className="absolute top-[25%] right-[28%] w-8 h-8 bg-red-500/50 rounded-full blur-xl animate-pulse"></div>
                      <div className="absolute top-[35%] right-[25%] w-10 h-10 bg-amber-500/40 rounded-full blur-xl delay-75"></div>
                      <div className="absolute top-[55%] right-[38%] w-16 h-16 bg-blue-500/30 rounded-full blur-2xl"></div>
                      <div className="absolute bottom-[20%] left-[30%] w-12 h-12 bg-emerald-500/20 rounded-full blur-xl"></div>
                   </div>
                   
                   <div className="mt-5 pt-5 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500 relative z-10">
                     <p className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5"/> 基于通信基站与 LBS 数据聚类 (已进行脱敏与合规化处理)</p>
                     <button className="text-blue-600 font-bold hover:text-white px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-600 transition-colors shadow-sm">导出热力洞察报表</button>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* RFID / NFC Binding Modal */}
      {showRfidModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm shadow-xl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                  <ScanLine className="w-5 h-5 text-amber-600" /> 
                </div>
                RFID/NFC 物理智能芯片绑定
              </h3>
              <button onClick={() => setShowRfidModal(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-8 flex flex-col items-center">
              <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mb-6 relative shadow-inner">
                <ScanLine className="w-10 h-10 text-amber-500 animate-pulse" />
                <div className="absolute inset-0 border-[6px] border-amber-200 rounded-full animate-ping opacity-20"></div>
              </div>
              
              <h4 className="text-lg font-black text-slate-800 mb-2 tracking-wide">感应终端或扫描物理标签</h4>
              <p className="text-xs text-slate-500 text-center mb-8 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                请将您的定制读卡器、智能扫码设备或 NFC 手机靠近电子标牌传感器，系统将挂载并映射至该批次生命周期档案库。
              </p>

              <div className="w-full">
                <label className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5">当前挂载目标批次</label>
                <div className="w-full border border-slate-200 bg-slate-100 px-4 py-3 rounded-xl text-sm font-bold text-slate-500 mb-5 cursor-not-allowed shadow-inner flex items-center justify-between">
                  <span>{crops.find(c => c.id === showRfidModal)?.name}</span>
                  <span className="font-mono text-xs">{crops.find(c => c.id === showRfidModal)?.batchNo}</span>
                </div>

                <label className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5">物理标签通用通信协议 ID (RFID/NFC)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="等待感应输入..."
                    className="w-full border border-slate-300 px-3 py-2 rounded text-sm placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono"
                    autoFocus
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-200">
               <button onClick={() => setShowRfidModal(null)} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 rounded text-sm transition-colors">取消</button>
               <button 
                 onClick={() => {
                   setIsProcessingRfid(true);
                   setTimeout(() => {
                     setIsProcessingRfid(false);
                     setShowRfidModal(null);
                     showToast('RFID / NFC物理芯片挂载成功');
                   }, 800);
                 }} 
                 disabled={isProcessingRfid}
                 className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded shadow-sm text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
               >
                 {isProcessingRfid ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : null}
                 确认绑定
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
