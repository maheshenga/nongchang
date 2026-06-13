import { Truck, MapPin, AlertTriangle, CheckCircle2, Clock, Search, Zap, Leaf, PackageSearch, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import DemoBadge from './DemoBadge';

const MOCK_ROUTES = [
  {
    id: 'SF10293848576',
    status: 'transit',
    from: '云南大理培育基地',
    to: '上海浦东新区花卉集散中心',
    currentLocation: '湖南省怀化市分拨中心 (运输中)',
    events: [
      { time: '2026-06-07 14:30:00', desc: '到达湖南省怀化市分拨中心', type: 'normal' },
      { time: '2026-06-06 20:15:00', desc: '发往上海浦东新区花卉集散中心', type: 'normal' },
      { time: '2026-06-06 18:00:00', desc: '云南大理白族自治州公司 已收件', type: 'normal' },
    ]
  },
  {
    id: 'JD88293019283',
    status: 'abnormal',
    from: '华南芍药集散中心',
    to: '深圳市南山区某花卉门店',
    currentLocation: '深中通道高速服务区 (滞留)',
    events: [
      { time: '2026-06-05 09:00:00', desc: '物流长时间未更新，车辆可能因前方事故或天气原因滞留！', type: 'abnormal' },
      { time: '2026-06-05 08:15:00', desc: '离开华南中心，发往深圳南山', type: 'normal' },
    ]
  },
  {
    id: 'ZT40192837465',
    status: 'delivered',
    from: '山东菏泽繁育基地',
    to: '北京通州大宗干线',
    currentLocation: '已签收',
    events: [
      { time: '2026-06-06 10:20:00', desc: '已签收，签收人：本人凭取货码签收。', type: 'normal' },
      { time: '2026-06-06 08:30:00', desc: '正在派件，派件员：张师傅。', type: 'normal' },
    ]
  }
];

const MOCK_SUPPLIES = [
  { id: 'SP-2026-001', name: '芍药专用缓释肥复合肥', unit: '包(50kg)', total: 500, used: 320, alert: false },
  { id: 'SP-2026-002', name: '土壤杀菌剂(多菌灵)', unit: '箱', total: 50, used: 48, alert: true },
  { id: 'SP-2026-003', name: '植物营养液(微量元素)', unit: '桶(20L)', total: 100, used: 20, alert: false },
];

export default function LogisticsTracker() {
  const [routes, setRoutes] = useState(MOCK_ROUTES);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoute, setActiveRoute] = useState(MOCK_ROUTES[1]); // Default to the abnormal one to show feature
  const [viewMode, setViewMode] = useState<'tracker' | 'optimization' | 'supplies'>('tracker');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const [showInboundModal, setShowInboundModal] = useState(false);
  const [showOutboundModal, setShowOutboundModal] = useState(false);
  const [suppliesData, setSuppliesData] = useState(MOCK_SUPPLIES);

  // Issue/registration form states
  const [issuePayload, setIssuePayload] = useState({ supplyId: '', amount: 0, targetBatch: '' });
  const [inboundPayload, setInboundPayload] = useState({ name: '', amount: 0, unit: '箱' });

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const markRouteDelivered = () => {
    setRoutes(prev => prev.map(r => {
      if (r.id === activeRoute.id) {
        const nr = { ...r, status: 'delivered', currentLocation: '已签收 (仓储入库确认)' };
        setActiveRoute(nr);
        return nr;
      }
      return r;
    }));
    showToast(`物流单 ${activeRoute.id} 状态已更新，商品已安全签收入库`);
  };

  const handleIssueSubmit = () => {
    if(!issuePayload.supplyId || issuePayload.amount <= 0) return showToast('请输入完整信息');
    const target = suppliesData.find(s => s.id === issuePayload.supplyId);
    if(target && issuePayload.amount > (target.total - target.used)) {
      return showToast('超量预警！您下达的领用配额超过了可用库存，操作被熔断。');
    }
    setSuppliesData(suppliesData.map(s => {
      if(s.id === issuePayload.supplyId) {
        return { ...s, used: s.used + issuePayload.amount, alert: (s.total - (s.used + issuePayload.amount)) < 10 };
      }
      return s;
    }));
    setShowOutboundModal(false);
    setIssuePayload({ supplyId: '', amount: 0, targetBatch: '' });
    showToast('领用单下发成功');
  };

  const handleInboundSubmit = () => {
    if(!inboundPayload.name || inboundPayload.amount <= 0) return showToast('请输入完整信息');
    setSuppliesData([...suppliesData, {
      id: `SP-2026-00${suppliesData.length + 1}`,
      name: inboundPayload.name,
      unit: inboundPayload.unit,
      total: inboundPayload.amount,
      used: 0,
      alert: false
    }]);
    setShowInboundModal(false);
    setInboundPayload({ name: '', amount: 0, unit: '箱' });
    showToast('农资入库完成');
  };

  const filteredRoutes = routes.filter(route => 
    route.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    route.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
    route.to.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600" />
            芍药智能物流与农资追踪面板
            <DemoBadge />
          </h2>
          <p className="text-xs text-slate-500 mt-1">集成包裹物流追踪、车队运力优化与农资出入库自动关联</p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto flex-col sm:flex-row shadow-sm rounded-lg overflow-hidden">
          <div className="bg-slate-100 p-1 rounded-lg flex items-center shrink-0 w-full sm:w-auto">
             <button 
                onClick={() => setViewMode('tracker')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'tracker' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600 hover:text-slate-800'}`}
             >实时追踪</button>
             <button 
                onClick={() => setViewMode('optimization')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'optimization' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-600 hover:text-slate-800'}`}
             >路径优化</button>
             <button 
                onClick={() => setViewMode('supplies')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'supplies' ? 'bg-white shadow-sm text-cyan-700' : 'text-slate-600 hover:text-slate-800'}`}
             >农资投入品管理</button>
          </div>
          {viewMode === 'tracker' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="输入物流单号查询..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>
      </motion.div>

      <div className="flex-1 min-h-0">
        {viewMode === 'tracker' && (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        
        {/* Route List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 text-sm">
            近期物流运单监控
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            <AnimatePresence>
            {filteredRoutes.map((route, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={route.id}
                onClick={() => setActiveRoute(route)}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${activeRoute.id === route.id ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono font-bold text-slate-800 text-sm">{route.id}</span>
                  {route.status === 'abnormal' && <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> 异常</span>}
                  {route.status === 'transit' && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold">运输中</span>}
                  {route.status === 'delivered' && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded font-bold">已签收</span>}
                </div>
                <div className="text-xs text-slate-600 mb-1 flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-slate-200 inline-flex items-center justify-center text-[8px] font-bold">起</span> {route.from}
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-indigo-100 text-indigo-700 inline-flex items-center justify-center text-[8px] font-bold">终</span> {route.to}
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Tracking Details */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col p-6">
          <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-xl text-slate-800 font-mono tracking-tight">{activeRoute.id}</h3>
              <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> 当前位置: 
                <span className={`font-semibold ${activeRoute.status === 'abnormal' ? 'text-red-600' : 'text-slate-800'}`}>
                  {activeRoute.currentLocation}
                </span>
              </p>
            </div>
            
            {activeRoute.status === 'abnormal' && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl max-w-sm">
                <h4 className="text-red-800 font-bold text-sm flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4" /> 物流异常告警
                </h4>
                <p className="text-xs text-red-600">该运单轨迹已超过 48 小时未更新，可能发生滞留或丢件。系统已标记醒目状态，请及时联系承运方核实。</p>
                <button className="mt-3 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-700 transition">
                  一键催单跟进
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-8 pr-2">
            <div className="flex flex-col">
              <h4 className="font-bold text-slate-700 text-sm mb-4">实时地图轨迹可视化</h4>
              <div className="relative w-full h-[300px] md:h-full min-h-[300px] bg-slate-100 rounded-xl border border-slate-200 overflow-hidden shadow-inner">
                 <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')] mix-blend-multiply"></div>
                 {/* Decorative elements to simulate map routes */}
                 <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M 15 85 Q 40 40, 60 45 T 85 15" fill="none" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
                    <path d="M 15 85 Q 40 40, 60 45 T 85 15" fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4" className="animate-[dash_10s_linear_infinite]" strokeLinecap="round" />
                    {/* Origin Dot */}
                    <circle cx="15" cy="85" r="3" fill="#cbd5e1" stroke="#fff" strokeWidth="1" />
                    {/* Destination Dot */}
                    <circle cx="85" cy="15" r="3" fill="#cbd5e1" stroke="#fff" strokeWidth="1" />
                 </svg>
                 
                 {/* Markers */}
                 <div className="absolute top-[85%] left-[15%] -translate-x-1/2 -translate-y-full pb-2 z-10 transition-all duration-500">
                    <div className="bg-white/90 backdrop-blur border border-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded shadow-sm whitespace-nowrap font-medium">起: {activeRoute.from}</div>
                 </div>
                 <div className="absolute top-[45%] left-[60%] -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-500">
                    <div className="relative flex justify-center items-center">
                      {activeRoute.status === 'abnormal' ? (
                         <>
                            <div className="absolute inset-0 bg-red-500/30 rounded-full animate-ping scale-150"></div>
                            <Truck className="w-5 h-5 text-red-600 relative z-10 drop-shadow-md" />
                         </>
                      ) : (
                         <>
                            <div className="absolute inset-0 bg-indigo-500/30 rounded-full animate-ping scale-150"></div>
                            <Truck className="w-5 h-5 text-indigo-600 relative z-10 drop-shadow-md" />
                         </>
                      )}
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5">
                      <div className={`${activeRoute.status === 'abnormal' ? 'bg-red-600' : 'bg-indigo-600'} text-white text-[10px] px-2.5 py-1 rounded-full shadow-lg whitespace-nowrap font-bold`}>当前: {activeRoute.currentLocation.split(' ')[0]}</div>
                    </div>
                 </div>
                 <div className="absolute top-[15%] left-[85%] -translate-x-1/2 -translate-y-full pb-2 z-10 transition-all duration-500">
                    <div className="bg-white/90 backdrop-blur border border-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded shadow-sm whitespace-nowrap font-medium">终: {activeRoute.to}</div>
                 </div>
              </div>
            </div>

            <div className="flex flex-col">
              <h4 className="font-bold text-slate-700 text-sm mb-6">仓储及转运状态变更时间轴</h4>
              <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-indigo-200 before:via-slate-200 before:to-transparent">
                {activeRoute.events.map((event, idx) => (
                  <div key={idx} className="relative flex items-start group is-active">
                    <div className={`absolute left-0 -ml-[5px] flex items-center justify-center w-6 h-6 rounded-full border-4 border-white ${event.type === 'abnormal' ? 'bg-red-500' : (idx === 0 ? 'bg-indigo-500' : 'bg-slate-300')} shadow shrink-0 z-10`}>
                      {event.type === 'abnormal' ? <AlertTriangle className="w-3 h-3 text-white" /> : (idx === 0 ? <Truck className="w-3 h-3 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-white"/>)}
                    </div>
                    
                    <div className="w-full pl-6 text-left">
                      <div className={`p-4 rounded-xl border shadow-sm transition-all duration-300 hover:shadow-md ${event.type === 'abnormal' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-700'}`}>
                        <div className="flex justify-between items-start mb-1.5">
                           <p className="text-sm font-bold">{event.desc.split('，')[0]}</p>
                           <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded">{event.time}</span>
                        </div>
                        {event.desc.includes('，') && <p className="text-xs opacity-80 mt-1">{event.desc.substring(event.desc.indexOf('，') + 1)}</p>}
                        {event.type === 'abnormal' && !event.desc.includes('，') && <p className="text-xs opacity-80 mt-1">{event.desc}</p>}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Origin node */}
                <div className="relative flex items-start group">
                    <div className="absolute left-0 -ml-[5px] flex items-center justify-center w-6 h-6 rounded-full border-4 border-white bg-slate-200 shadow shrink-0 z-10">
                    </div>
                    <div className="w-full pl-6 text-left">
                      <p className="text-sm font-medium text-slate-500 mt-0.5">包裹等待揽收: {activeRoute.from}</p>
                    </div>
                </div>
              </div>
            </div>

            {activeRoute.status !== 'delivered' && (
              <div className="mt-8 flex justify-end">
                 <button 
                   onClick={markRouteDelivered}
                   className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow shadow-indigo-200"
                 >
                   <CheckCircle2 className="w-4 h-4" /> 确认签收入库
                 </button>
              </div>
            )}
          </div>
        </div>
          </motion.div>
        )}

        {viewMode === 'optimization' && (
          <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="h-full bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg flex flex-col p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                   <Zap className="w-5 h-5 text-amber-500" /> AI 智能运力调度与碳减排追踪
                </h3>
                <p className="text-sm text-slate-500 mt-1">基于实时订单分布聚类分析，自动分配最优配送车辆并规划低碳排路线</p>
              </div>
              <button 
                onClick={() => {
                  setIsOptimizing(true);
                  setTimeout(() => { setIsOptimizing(false); setOptimized(true); showToast('AI 智能运力调度与碳减排追踪优化已完成'); }, 2000);
                }}
                disabled={isOptimizing || optimized}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50 hover:-translate-y-0.5"
              >
                {isOptimizing ? <span className="animate-pulse">计算优化中...</span> : optimized ? '已优化当前排班' : '生成最优排期与路线'}
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 shrink-0">
               <motion.div whileHover={{ y: -5 }} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between transition-all shadow-sm">
                 <div>
                   <p className="text-xs text-slate-500 mb-1">待分配同城包裹</p>
                   <p className="text-2xl font-bold text-slate-800 font-mono">1,452</p>
                 </div>
                 <div className="bg-blue-100 p-3 rounded-full text-blue-600"><Truck className="w-6 h-6"/></div>
               </motion.div>
               <motion.div whileHover={{ y: -5 }} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between transition-all shadow-sm">
                 <div>
                   <p className="text-xs text-slate-500 mb-1">运载负载率 (优化{optimized ? '后' : '前'})</p>
                   <p className={`text-2xl font-bold font-mono ${optimized ? 'text-emerald-600' : 'text-slate-800'}`}>
                     {optimized ? '92.4%' : '65.8%'}
                   </p>
                 </div>
                 <div className="bg-amber-100 p-3 rounded-full text-amber-600"><Zap className="w-6 h-6"/></div>
               </motion.div>
               <motion.div whileHover={{ y: -5 }} className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between shadow-sm transition-all">
                 <div>
                   <p className="text-xs text-emerald-600 font-medium mb-1">单日预估碳减排</p>
                   <p className="text-2xl font-bold text-emerald-700 font-mono flex items-baseline gap-1">
                     {optimized ? '348.5' : '---'}<span className="text-xs text-emerald-600/70">kg CO₂e</span>
                   </p>
                 </div>
                 <div className="bg-emerald-200 p-3 rounded-full text-emerald-800"><Leaf className="w-6 h-6"/></div>
               </motion.div>
            </div>

            <div className="flex-1 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden relative flex items-center justify-center">
               {/* Map Mockup Area */}
               <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cartographer.png')] mix-blend-multiply"></div>
               
               {isOptimizing ? (
                 <div className="flex flex-col items-center z-10 text-emerald-700">
                    <Zap className="w-12 h-12 animate-bounce mb-4" />
                    <h3 className="text-lg font-bold">K-Means 聚类处理订单节点中...</h3>
                    <p className="text-sm font-medium mt-2">正在分配车辆载重及限行区域计算</p>
                 </div>
               ) : optimized ? (
                 <div className="z-10 bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full text-center animate-in zoom-in-95 duration-500">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-800 mb-2">排班路线已生成</h3>
                    <p className="text-sm text-slate-600 line-clamp-3 mb-6">
                      基于新能源物流车队配载模型，本次共规划 14 条核心路线，总里程相比传统随机散发预计缩短 14.2%，达成平台绿色物流 SLA 目标。
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                       <div className="bg-slate-50 p-2 rounded border border-slate-100">
                         <div className="text-[10px] text-slate-400">调用车辆数</div>
                         <div className="text-lg font-bold text-slate-700 font-mono">14 V</div>
                       </div>
                       <div className="bg-slate-50 p-2 rounded border border-slate-100">
                         <div className="text-[10px] text-slate-400">预计省燃油排量</div>
                         <div className="text-lg font-bold text-slate-700 font-mono">128 L</div>
                       </div>
                    </div>
                    <button className="text-emerald-700 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors w-full">一键下发派车调度单</button>
                 </div>
               ) : (
                 <div className="z-10 text-slate-400 flex flex-col items-center">
                    <MapPin className="w-12 h-12 mb-3 opacity-50" />
                    <p className="font-bold">点击右上角按钮</p>
                    <p className="text-sm">启动智能路线规划算法</p>
                 </div>
               )}
            </div>
          </motion.div>
        )}

        {viewMode === 'supplies' && (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                     <PackageSearch className="w-5 h-5 text-cyan-600" />
                     农资投入品库存与自动对账
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">系统已将农事实操（扫码打卡）自动与此库存领用扣减关联对账，防止超量违规使用。</p>
               </div>
               <div className="flex gap-3">
                  <button onClick={() => setShowInboundModal(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all shadow-sm">
                     入库登记
                  </button>
                  <button onClick={() => setShowOutboundModal(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm hover:bg-cyan-700 transition-all hover:-translate-y-0.5">
                     <Plus className="w-4 h-4" /> 领用下达
                  </button>
               </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div className="bg-cyan-50/50 border border-cyan-100 p-4 rounded-xl flex items-start gap-3">
                    <ShieldCheck className="w-8 h-8 text-cyan-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">防超额校验机制开启</h4>
                      <p className="text-xs text-slate-500 mt-1">现场打卡记录的化肥实际消耗将与库存出账单比对，用量超出110%即刻熔断并报警。</p>
                    </div>
                 </div>
              </div>

              <h4 className="font-bold text-slate-700 text-sm mb-4">投入品台账</h4>
              <div className="space-y-3">
                 <AnimatePresence>
                 {suppliesData.map((item, idx) => (
                    <motion.div 
                       initial={{ opacity: 0, y: 15 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ delay: idx * 0.1 }}
                       key={item.id} 
                       className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${item.alert ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}`}
                    >
                       <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                             <span className="font-mono text-xs font-bold text-slate-400">{item.id}</span>
                             {item.alert && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded font-bold border border-red-200">库存预警</span>}
                          </div>
                          <span className="font-bold text-slate-800">{item.name}</span>
                       </div>
                       
                       <div className="flex items-center gap-12">
                          <div className="text-right hidden md:block">
                             <span className="text-xs text-slate-500 block mb-1">入库总量</span>
                             <span className="font-bold text-slate-700">{item.total} {item.unit}</span>
                          </div>
                          <div className="text-right">
                             <span className="text-xs text-slate-500 block mb-1">已领用/消耗</span>
                             <span className="font-bold text-cyan-700">{item.used} {item.unit}</span>
                          </div>
                          <div className="w-32 hidden md:block">
                             <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-500 font-medium">剩余</span>
                                <span className={`font-bold ${item.total - item.used < 10 ? 'text-red-600' : 'text-slate-700'}`}>{item.total - item.used}</span>
                             </div>
                             <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${item.total - item.used < 10 ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${(item.used / item.total) * 100}%` }}></div>
                             </div>
                          </div>
                          <button 
                            onClick={() => {
                              if (window.confirm('确认删除此农资记录吗？')) {
                                setSuppliesData(suppliesData.filter(s => s.id !== item.id));
                                showToast(`已删除农资档案：${item.name}`);
                              }
                            }}
                            className="ml-4 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold transition-colors border border-red-200"
                          >
                            删除
                          </button>
                       </div>
                    </motion.div>
                 ))}
                 </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {showInboundModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
           <motion.div initial={{scale:0.95, opacity:0}} animate={{scale:1, opacity:1}} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
              <h3 className="font-bold text-slate-800 text-lg mb-4">农资入库登记</h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">投入品名称</label>
                    <input type="text" value={inboundPayload.name} onChange={(e) => setInboundPayload({...inboundPayload, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="例如：复合肥" />
                 </div>
                 <div className="flex gap-3">
                    <div className="flex-1">
                       <label className="block text-xs font-bold text-slate-500 mb-1">入库数量</label>
                       <input type="number" value={inboundPayload.amount} onChange={(e) => setInboundPayload({...inboundPayload, amount: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                    <div className="w-24">
                       <label className="block text-xs font-bold text-slate-500 mb-1">单位</label>
                       <select value={inboundPayload.unit} onChange={(e) => setInboundPayload({...inboundPayload, unit: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                          <option>箱</option>
                          <option>包(50kg)</option>
                          <option>桶(20L)</option>
                          <option>件</option>
                       </select>
                    </div>
                 </div>
              </div>
              <div className="flex gap-2 mt-6">
                 <button onClick={() => setShowInboundModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50">取消</button>
                 <button onClick={handleInboundSubmit} className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-bold shadow">确认入库</button>
              </div>
           </motion.div>
        </div>
      )}

      {showOutboundModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
           <motion.div initial={{scale:0.95, opacity:0}} animate={{scale:1, opacity:1}} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
              <h3 className="font-bold text-slate-800 text-lg mb-1">农资领用下达</h3>
              <p className="text-xs text-slate-500 mb-4">领用明细将直接绑定目标批次的农事实操记录</p>
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">选择库存物资</label>
                    <select value={issuePayload.supplyId} onChange={(e) => setIssuePayload({...issuePayload, supplyId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                       <option value="">-- 请选择 --</option>
                       {suppliesData.map(s => <option key={s.id} value={s.id}>{s.name} (剩余 {s.total - s.used} {s.unit})</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">关联溯源批次号 (自动对账校验)</label>
                    <input type="text" value={issuePayload.targetBatch} onChange={(e) => setIssuePayload({...issuePayload, targetBatch: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="OB-2024-..." />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">本次下达/领用数量</label>
                    <input type="number" value={issuePayload.amount} onChange={(e) => setIssuePayload({...issuePayload, amount: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                 </div>
                 <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">库存预警与超量限制已开启，过量领用将被系统自动拦截熔断并上传区块链存证审计。</p>
                 </div>
              </div>
              <div className="flex gap-2 mt-6">
                 <button onClick={() => setShowOutboundModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50">取消</button>
                 <button onClick={handleIssueSubmit} className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-bold shadow">确认下发</button>
              </div>
           </motion.div>
        </div>
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

