import { ShieldCheck, Download, MoreHorizontal, AlertTriangle, X, Bell, Thermometer, Search, ToggleLeft, ToggleRight, Server, DatabaseBackup, Settings, Activity, Lock, CheckCircle2, Store } from 'lucide-react';
import { Agent } from '../types';
import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';

const MOCK_AGENTS: Agent[] = [
  { id: 'A001', name: '华东大区花市总代 (张建国)', level: '一级代理', region: '上海市, 浙江省, 江苏省', sales: 1250000, status: 'Active' },
  { id: 'A002', name: '华南芍药集散中心', level: '二级代理', parent: '华东大区花市总代', region: '广州市芳村', sales: 340000, status: 'Active' },
  { id: 'A003', name: '大理品芍合作社', level: '一级代理', region: '云南省大理白族自治州', sales: 890000, status: 'Pending' },
  { id: 'A004', name: '绿通高档盆景供应链', level: '三级网点', parent: '华南芍药集散中心', region: '深圳市南山区花卉小镇', sales: 12000, status: 'Inactive' },
];

const MOCK_SERVER_DATA = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  cpu: Math.floor(Math.random() * 30) + 20,
  memory: Math.floor(Math.random() * 20) + 40,
  requests: Math.floor(Math.random() * 500) + 1000,
}));

export default function SystemAdmin() {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [actionPending, setActionPending] = useState('');
  const [unreadApprovals, setUnreadApprovals] = useState(3); // Mocking new approvals
  const [archiveAlert, setArchiveAlert] = useState<string | null>(null);
  const [envAlarm, setEnvAlarm] = useState<string | null>(null);

  // Simulate real-time incoming approvals and batch archive alerts
  useEffect(() => {
    const timer = setInterval(() => {
      setUnreadApprovals(prev => prev + 1);
    }, 15000);
    
    // Simulate auto-archive notification
    const archiveTimer = setTimeout(() => {
      setArchiveAlert('系统检测到 14,021 条历史(>5年)上链溯源记录，已自动归档并释放存储空间。');
    }, 3000);

    const envTimer = setTimeout(() => {
      setEnvAlarm('冷库B区温度异常 (8°C)，偏离芍药冷藏标准 (2-4°C)');
    }, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(archiveTimer);
      clearTimeout(envTimer);
    };
  }, []);

  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchActionType, setBatchActionType] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const filteredAgents = agents.filter(agent => {
    const matchQuery = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       agent.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       agent.parent?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || agent.status.toLowerCase() === statusFilter.toLowerCase();
    const matchLevel = levelFilter === 'all' || agent.level === levelFilter;
    return matchQuery && matchStatus && matchLevel;
  });

  const handleSelectAgent = (id: string) => {
    const newSelected = new Set(selectedAgents);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAgents(newSelected);
  };

  const handleSelectAllAgents = () => {
    if (selectedAgents.size === agents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(agents.map(a => a.id)));
    }
  };

  const handleBatchAction = (action: string) => {
    if (selectedAgents.size === 0) return;
    setBatchActionType(action);
    setShowBatchModal(true);
  };

  const handleSensitiveAction = (action: string) => {
    setActionPending(action);
    setShowConfirmModal(true);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const confirmAction = () => {
    setIsProcessing(true);
    setTimeout(() => {
        setIsProcessing(false);
        setShowConfirmModal(false);
        showToast(`已成功修改：${actionPending}`);
    }, 800);
  };

  const confirmBatchAction = () => {
    setIsProcessing(true);
    setTimeout(() => {
        if (batchActionType === '注销') {
            setAgents(prev => prev.filter(a => !selectedAgents.has(a.id)));
        } else {
            setAgents(prev => prev.map(a => {
                if (selectedAgents.has(a.id)) {
                    return { ...a, status: batchActionType === '驳回' ? 'Inactive' : 'Active' };
                }
                return a;
            }));
        }
        setIsProcessing(false);
        setShowBatchModal(false);
        showToast(`批量操作 [${batchActionType}] 已对 ${selectedAgents.size} 个节点生效`);
        setSelectedAgents(new Set());
    }, 800);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 relative"
    >
      {/* System Command Center Header */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-slate-900 rounded-2xl p-6 text-slate-100 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" /> 
                全网节点运行监控
              </h2>
              <p className="text-sm text-slate-400 mt-1">主核心服务组 24 小时性能基准</p>
            </div>
            <div className="flex items-center gap-3">
               <span className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                 SYSTEM ONLINE
               </span>
            </div>
          </div>
          
          <div className="h-48 w-full relative z-10">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MOCK_SERVER_DATA} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={30} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} 
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Area type="monotone" dataKey="cpu" name="CPU 负载 (%)" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>
        
        {/* Quick Stats Grid replacing the row of 4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-50 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <p className="text-xs text-slate-500 font-medium mb-2 relative z-10">区块链节点状态</p>
            <div className="flex items-end gap-2 relative z-10">
              <span className="text-3xl font-black text-slate-800 tracking-tight">12/12</span>
            </div>
            <div className="mt-2 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded w-max font-bold flex items-center gap-1 relative z-10">
              <ShieldCheck className="w-3 h-3" /> 健康同步中
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-50 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <p className="text-xs text-slate-500 font-medium mb-2 relative z-10">API 响应延迟</p>
            <div className="flex items-end gap-2 relative z-10">
              <span className="text-3xl font-black text-slate-800 tracking-tight">42<span className="text-sm font-medium text-slate-500 ml-1">ms</span></span>
            </div>
            <div className="mt-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded w-max font-bold flex items-center gap-1 relative z-10">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></div> 流畅
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-center relative overflow-hidden group">
             <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-50 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <p className="text-xs text-slate-500 font-medium mb-2 relative z-10">存证数据 (今日)</p>
            <div className="flex items-end gap-2 relative z-10">
              <span className="text-3xl font-black text-slate-800 tracking-tight">8.4<span className="text-sm font-medium text-slate-500 ml-1">k</span></span>
            </div>
            <div className="mt-2 text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded w-max font-bold flex items-center gap-1 relative z-10">
              <Download className="w-3 h-3" /> 实时写入
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-amber-50 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
            <p className="text-xs text-slate-500 font-medium mb-2 relative z-10">活跃商户通联</p>
            <div className="flex items-end gap-2 relative z-10">
              <span className="text-3xl font-black text-slate-800 tracking-tight">329</span>
            </div>
            <div className="mt-2 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded w-max font-bold flex items-center gap-1 relative z-10">
              <AlertTriangle className="w-3 h-3" /> 2 掉线告警
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Approval Notification Bubble */}
      {unreadApprovals > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full relative">
              <Bell className="w-5 h-5 text-blue-600" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                {unreadApprovals}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">新审批提醒</p>
              <p className="text-xs text-blue-700">您有 {unreadApprovals} 条新的权限申请或分销变更待处理。</p>
            </div>
          </div>
          <button 
            onClick={() => setUnreadApprovals(0)}
            className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            去处理
          </button>
        </div>
      )}

      {/* Auto-archive Alert */}
      {archiveAlert && (
         <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between shadow-sm animate-in fade-in zoom-in-95 duration-500">
           <div className="flex items-center gap-3">
             <div className="bg-amber-100 p-2 rounded-full">
               <AlertTriangle className="w-5 h-5 text-amber-600" />
             </div>
             <div>
               <p className="text-sm font-semibold text-amber-900">批次流转已完结待归档</p>
               <p className="text-xs text-amber-700">系统检测到批次 <span className="font-mono font-bold">{archiveAlert}</span> 已完成全部销售流转且出库完毕。是否移入历史数据库以清理看板？</p>
             </div>
           </div>
           <div className="flex gap-2 shrink-0">
              <button onClick={() => setArchiveAlert(null)} className="text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded transition-colors font-medium">暂不处理</button>
              <button 
                 onClick={() => {
                   setArchiveAlert(null);
                 }} 
                 className="text-xs text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded transition-colors font-medium shadow-sm"
              >
                自动归档
              </button>
           </div>
         </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Configs */}
        <div className="space-y-6">
          {/* Global Feature Management */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">全局功能服务管理</h3>
                  <p className="text-xs text-slate-500 mt-0.5">一键启用/禁用平台级核心功能模块</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="group flex flex-col p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 gap-3 transition-all hover:bg-emerald-50/60 hover:shadow-sm">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2.5">
                     <div className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                     </div>
                     <div className="text-sm font-bold text-slate-800">系统级 AI 农业助理 <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-bold ml-1.5 uppercase border border-indigo-200">Beta</span></div>
                   </div>
                   <button onClick={() => handleSensitiveAction('系统级 AI 农业助理')} className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                     <span className="sr-only">Use setting</span>
                     <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-emerald-500 transition-colors duration-200 ease-in-out"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute left-0 inline-block h-5 w-5 translate-x-4 transform rounded-full border border-slate-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out"></span>
                   </button>
                 </div>
                 <div className="text-xs text-slate-600 ml-4 pl-0.5 leading-relaxed">为全平台商户开启业务数据深度挖掘与产量预测辅助决策。</div>
                 <div className="flex items-center gap-5 ml-4 pl-0.5 bg-white/80 p-2.5 rounded-lg border border-emerald-100 shadow-sm backdrop-blur-sm">
                    <div className="text-[10px] flex items-center gap-1.5">
                      <span className="text-slate-500">调用频次:</span> <span className="font-bold text-slate-800 text-xs text-emerald-600">1.2w <span className="text-[10px] text-emerald-600/70 font-normal">次/日</span></span>
                    </div>
                    <div className="w-px h-3 bg-slate-200"></div>
                    <div className="text-[10px] flex items-center gap-1.5">
                      <span className="text-slate-500">算力消耗:</span> <span className="font-bold text-slate-800 text-xs">45.2%</span>
                    </div>
                 </div>
              </div>

              <div className="group flex flex-col p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 gap-3 transition-all hover:bg-emerald-50/60 hover:shadow-sm">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2.5">
                     <div className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                     </div>
                     <div className="text-sm font-bold text-slate-800">IoT 物联网数据总线</div>
                   </div>
                   <button onClick={() => handleSensitiveAction('IoT 物联网实时数据流')} className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                     <span className="sr-only">Use setting</span>
                     <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-emerald-500 transition-colors duration-200 ease-in-out"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute left-0 inline-block h-5 w-5 translate-x-4 transform rounded-full border border-slate-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out"></span>
                   </button>
                 </div>
                 <div className="text-xs text-slate-600 ml-4 pl-0.5 leading-relaxed">允许接入各类智能农机、温室传感器数据流，实现环境自动调控。</div>
                 <div className="flex items-center gap-5 ml-4 pl-0.5 bg-white/80 p-2.5 rounded-lg border border-emerald-100 shadow-sm backdrop-blur-sm">
                    <div className="text-[10px] flex items-center gap-1.5">
                      <span className="text-slate-500">在线设备:</span> <span className="font-bold text-slate-800 text-xs text-blue-600">1,421 <span className="text-[10px] text-blue-600/70 font-normal">台</span></span>
                    </div>
                    <div className="w-px h-3 bg-slate-200"></div>
                    <div className="text-[10px] flex items-center gap-1.5">
                      <span className="text-slate-500">数据吞吐:</span> <span className="font-bold text-slate-800 text-xs">2.1 <span className="text-[10px] text-slate-500 font-normal">GB/h</span></span>
                    </div>
                 </div>
              </div>

              <div className="group flex flex-col p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 gap-3 transition-all hover:bg-emerald-50/60 hover:shadow-sm">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2.5">
                     <div className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                     </div>
                     <div className="text-sm font-bold text-slate-800">消费者端防伪溯源 H5</div>
                   </div>
                   <button onClick={() => handleSensitiveAction('消费者端防伪溯源 H5')} className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                     <span className="sr-only">Use setting</span>
                     <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-emerald-500 transition-colors duration-200 ease-in-out"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute left-0 inline-block h-5 w-5 translate-x-4 transform rounded-full border border-slate-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out"></span>
                   </button>
                 </div>
                 <div className="text-xs text-slate-600 ml-4 pl-0.5 leading-relaxed">控制 C 端用户扫描包装溯源二维码的访问权限及界面展示。</div>
                 <div className="flex items-center gap-5 ml-4 pl-0.5 bg-white/80 p-2.5 rounded-lg border border-emerald-100 shadow-sm backdrop-blur-sm">
                    <div className="text-[10px] flex items-center gap-1.5">
                      <span className="text-slate-500">今日扫码:</span> <span className="font-bold text-slate-800 text-xs">15.4k <span className="text-[10px] text-slate-500 font-normal">次</span></span>
                    </div>
                    <div className="w-px h-3 bg-slate-200"></div>
                    <div className="text-[10px] flex items-center gap-1.5">
                      <span className="text-slate-500">平均停留:</span> <span className="font-bold text-slate-800 text-xs">45<span className="text-[10px] text-slate-500 font-normal">s</span></span>
                    </div>
                 </div>
              </div>

              <div className="group flex flex-col p-4 rounded-xl border border-slate-200 bg-slate-50/80 gap-3 transition-colors opacity-80 hover:opacity-100">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2.5">
                     <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                     <div className="text-sm font-bold text-slate-500">跨国节点多语言支持</div>
                   </div>
                   <button onClick={() => handleSensitiveAction('跨国节点多语言支持')} className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                     <span className="sr-only">Use setting</span>
                     <span aria-hidden="true" className="pointer-events-none absolute h-full w-full rounded-md bg-white"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-slate-200 transition-colors duration-200 ease-in-out"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute left-0 inline-block h-5 w-5 translate-x-0 transform rounded-full border border-slate-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out"></span>
                   </button>
                 </div>
                 <div className="text-xs text-slate-500 ml-4 pl-0.5 leading-relaxed">启用自动化界面多语言切换与贸易报关单据双语化。</div>
                 <div className="flex items-center gap-5 ml-4 pl-0.5 bg-slate-100/50 p-2.5 rounded-lg border border-slate-200 shadow-inner">
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      模块尚未激活，需部署海外边缘节点。
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Permission & Approval Config */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">多级审批与权限配置</h3>
                  <p className="text-xs text-slate-500 mt-0.5">多中心化决策保障核心数据安全</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { role: '溯源码生成审批', assignees: '平台超管, 财务主管', required: true },
                { role: '核心分销商入驻', assignees: '渠道总监', required: true },
                { role: '养护/质检数据上链', assignees: '基地质检员, 芍药圃主管', required: false },
              ].map((flow, i) => (
                <div 
                  key={i} 
                  className="group flex flex-col p-4 rounded-xl border border-slate-100 bg-slate-50/50 gap-2.5 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-all hover:shadow-sm"
                  onClick={() => handleSensitiveAction(`修改 [${flow.role}] 审批流`)}
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-slate-800 text-sm">{flow.role}</span>
                    {flow.required ? (
                      <span className="bg-orange-50 text-orange-600 text-[10px] px-2 py-0.5 rounded border border-orange-100 font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> 需双重验证
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-600 text-[10px] px-2 py-0.5 rounded border border-emerald-100 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 自动放行
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                    <span className="text-slate-400">流转节点:</span> <span className="font-medium text-slate-700">{flow.assignees}</span>
                  </div>
                </div>
              ))}
              
              <button 
                onClick={() => handleSensitiveAction('添加新审批流')}
                className="w-full py-2.5 mt-2 border-2 border-dashed border-slate-200 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
              >
                + 添加新业务审批流
              </button>
            </div>
          </div>

          {/* Global Configuration Panel */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 text-slate-600 rounded-lg">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">平台全局安全与策略</h3>
                  <p className="text-xs text-slate-500 mt-0.5">主网与系统底层级参数管控</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="group flex flex-col p-4 rounded-xl border border-slate-100 bg-white gap-2 transition-colors hover:bg-slate-50">
                 <div className="flex justify-between items-center">
                   <div className="text-sm font-bold text-slate-800">强制全员双重认证 (2FA)</div>
                   <button onClick={() => handleSensitiveAction('强制全员双重认证 (2FA)')} className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                     <span aria-hidden="true" className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-emerald-500 transition-colors duration-200 ease-in-out"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute left-0 inline-block h-5 w-5 translate-x-4 transform rounded-full border border-slate-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out"></span>
                   </button>
                 </div>
                 <div className="text-[10px] text-slate-500">强制要求所有商家/代理商账单登录时启用二次面容或短信验证，防范撞库攻击。</div>
              </div>
              <div className="group flex flex-col p-4 rounded-xl border border-slate-100 bg-white gap-2 transition-colors hover:bg-slate-50">
                 <div className="flex justify-between items-center">
                   <div className="text-sm font-bold text-slate-800">严格防伪溯源流转模式</div>
                   <button onClick={() => handleSensitiveAction('严格防伪溯源流转模式')} className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2">
                     <span aria-hidden="true" className="pointer-events-none absolute mx-auto h-4 w-9 rounded-full bg-slate-200 transition-colors duration-200 ease-in-out"></span>
                     <span aria-hidden="true" className="pointer-events-none absolute left-0 inline-block h-5 w-5 translate-x-0 transform rounded-full border border-slate-200 bg-white shadow ring-0 transition-transform duration-200 ease-in-out"></span>
                   </button>
                 </div>
                 <div className="text-[10px] text-slate-500">开启后：下游扫码入库时，若上游未产生对应出库记录，将强制冻结该批次流转。</div>
              </div>

              <div className="h-px w-full bg-slate-100 my-2"></div>
              
              <button 
                 className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                 onClick={() => handleSensitiveAction('立即触发全量区块链快照备份')}
              >
                 <DatabaseBackup className="w-4 h-4 text-emerald-600" />
                 智能合约执行状态打点与全量快照备份
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Agents & Distributors List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[760px] overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                  <Store className="w-4 h-4" />
                </div>
                芍药分销代理商网络管理
              </h3>
              <p className="text-xs text-slate-500 mt-1">系统支持无限级树形结构代理与商品终端流通全链路追踪</p>
            </div>
            <div className="flex gap-3">
              <div className="flex gap-2">
                <button 
                  onClick={() => handleBatchAction('通过')}
                  disabled={selectedAgents.size === 0}
                  className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-100"
                 >
                   批量通过许可
                 </button>
                 <button 
                   onClick={() => handleBatchAction('驳回')}
                   disabled={selectedAgents.size === 0}
                   className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed border border-red-100"
                 >
                   批量驳回
                 </button>
                 <button 
                   onClick={() => handleBatchAction('注销')}
                   disabled={selectedAgents.size === 0}
                   className="bg-slate-50 text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg text-xs transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200"
                 >
                   批量注销
                 </button>
              </div>
              <button className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-1.5 rounded-lg text-xs transition-colors shadow-sm font-medium">
                <Download className="w-3.5 h-3.5 text-slate-500" />
                导出数据
              </button>
            </div>
          </div>
          
          <div className="px-5 py-3 flex flex-col sm:flex-row gap-3 bg-white border-b border-slate-100">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="搜索网络节点名称 / 负责人 / 流通区域..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />
            </div>
             <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 bg-slate-50/50 font-medium text-slate-600">
                <option value="all">所有网络状态</option>
                <option value="active">正常运作节点</option>
                <option value="pending">待审批加入网络</option>
                <option value="inactive">已冻结/异常节点</option>
             </select>
             <select 
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 bg-slate-50/50 font-medium text-slate-600">
                <option value="all">分级网络 (全部级别)</option>
                <option value="一级代理">L1 核心代理节点 (一级代理)</option>
                <option value="二级代理">L2 区域分销节点 (二级代理)</option>
                <option value="三级网点">终端自营/加盟网点 (三级网点)</option>
             </select>
          </div>
          
          <div className="flex-1 overflow-x-auto p-0 min-h-0 bg-slate-50/30">
             <table className="w-full text-left whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 uppercase tracking-widest bg-slate-100/80 sticky top-0 border-b border-slate-200 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-4 font-bold border-l-2 border-transparent w-12">
                    <input 
                      type="checkbox" 
                      checked={selectedAgents.size === filteredAgents.length && filteredAgents.length > 0}
                      onChange={() => {
                        if (selectedAgents.size === filteredAgents.length) {
                          setSelectedAgents(new Set());
                        } else {
                          setSelectedAgents(new Set(filteredAgents.map(a => a.id)));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 font-bold">代理商机构识别信息</th>
                  <th className="px-6 py-4 font-bold">网络级别及上游节点</th>
                  <th className="px-6 py-4 font-bold">授权流通区域</th>
                  <th className="px-6 py-4 font-bold">异常扫码监控阈值</th>
                  <th className="px-6 py-4 font-bold">节点流通量/销售业绩估算</th>
                  <th className="px-6 py-4 font-bold">连通状态</th>
                  <th className="px-6 py-4 font-bold cursor-pointer text-right">操作管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="px-6 py-4 border-l-2 border-transparent group-hover:border-blue-500">
                      <input 
                        type="checkbox" 
                        checked={selectedAgents.has(agent.id)}
                        onChange={() => handleSelectAgent(agent.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-sm">{agent.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono hover:text-blue-600 transition-colors cursor-pointer w-max">Node ID: {agent.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 flex-start">
                        <span className="font-bold text-blue-700 bg-blue-100 w-max px-2.5 py-1 rounded-md text-[10px] border border-blue-200 uppercase tracking-widest shadow-sm">{agent.level}</span>
                        {agent.parent && <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium"><span className="w-1.5 h-1.5 bg-slate-300 rounded-full group-hover:bg-blue-400 transition-colors"></span> 上级: {agent.parent}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs font-medium max-w-[150px] truncate" title={agent.region}>{agent.region}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <input type="number" defaultValue="5000" className="w-[80px] border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-700 font-mono font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm bg-white" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">次 / 异常</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-emerald-600 font-black text-sm">¥ {agent.sales.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {agent.status === 'Active' && <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 border border-emerald-200/60 rounded-md text-[10px] font-bold uppercase tracking-widest shadow-sm"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"/> 正常在网</span>}
                      {agent.status === 'Pending' && <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 border border-amber-200/60 rounded-md text-[10px] font-bold uppercase tracking-widest shadow-sm"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"/> 接入审核中</span>}
                      {agent.status === 'Inactive' && <span className="inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2.5 py-1 border border-slate-200 rounded-md text-[10px] font-bold uppercase tracking-widest shadow-sm"><div className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0"/> 连接处于冻结/断开</span>}
                    </td>
                    <td className="px-6 py-4 text-right opacity-80 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-[10px] text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors font-bold uppercase tracking-wider" onClick={() => handleSensitiveAction(`查看 [${agent.name}] 流水日记`)}>下级数据穿透</button>
                        <button className="text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-100 px-3 py-1.5 rounded-lg shadow-sm transition-colors font-bold uppercase tracking-wider" onClick={() => handleSensitiveAction(`配置 [${agent.name}] 额度权限`)}>调整权属</button>
                        <button className="text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg transition-colors border border-transparent hover:border-slate-200">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Environment Monitor */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
             <div>
               <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Thermometer className="w-4 h-4"/>
                </div>
                仓储环境监测预警
               </h3>
               <p className="text-xs text-slate-500 mt-1">实时监测各冷库及其环境指标，偏离芍药存储标准时自动推送报警</p>
             </div>
          </div>
          <div className="p-5 flex flex-col gap-4 bg-slate-50 flex-1">
             {envAlarm && (
               <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex flex-col gap-3 text-sm shadow-sm animate-in fade-in zoom-in duration-300">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-red-900">系统传感器警报: {envAlarm}</div>
                      <div className="text-red-700 text-xs mt-1 font-medium">系统已触发自动化规则：向仓管值班人员移动设备端静默推送即时通讯提醒。</div>
                    </div>
                  </div>
                  <button onClick={() => setEnvAlarm(null)} className="w-full py-1.5 bg-white hover:bg-slate-50 border border-red-200 text-red-700 rounded-lg font-bold text-xs shadow-sm focus:ring-4 focus:ring-red-500/10">
                    忽略并解除终端告警
                  </button>
               </div>
             )}
             <div className="flex flex-col gap-4">
                <div className={`p-5 border rounded-xl shadow-sm transition-colors ${envAlarm ? 'border-red-300 bg-white' : 'border-slate-200 bg-white'}`}>
                  <div className="text-sm font-bold text-slate-700 mb-4 flex justify-between items-center">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-800"></div>冷库 B 区 (鲜切花暂存区)</span>
                    {envAlarm ? <span className="text-red-500 flex items-center gap-1.5 text-[10px] font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100"><AlertTriangle className="w-3 h-3"/> 异常</span> : <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>检测正常</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className={`p-4 rounded-xl bg-slate-50 ${envAlarm ? 'border border-red-200 shadow-sm' : 'border border-slate-100'}`}>
                       <div className="text-xs text-slate-500 mb-1 font-medium">当前温度</div>
                       <div className={`text-3xl font-mono font-bold ${envAlarm ? 'text-red-600' : 'text-emerald-600'}`}>{envAlarm ? '8.0' : '2.5'}<span className="text-sm ml-1 text-slate-500 font-sans">°C</span></div>
                       <div className="text-[10px] text-slate-400 mt-2 tracking-wide font-mono">标准阈值: 2°C ~ 4°C</div>
                     </div>
                     <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                       <div className="text-xs text-slate-500 mb-1 font-medium">当前湿度</div>
                       <div className="text-3xl font-mono font-bold text-emerald-600">85<span className="text-sm ml-1 text-slate-500 font-sans">%</span></div>
                       <div className="text-[10px] text-slate-400 mt-2 tracking-wide font-mono">标准阈值: 80% ~ 90%</div>
                     </div>
                  </div>
                </div>

                <div className="p-5 border border-slate-200 bg-white shadow-sm rounded-xl transition-colors">
                  <div className="text-sm font-bold text-slate-700 mb-4 flex justify-between items-center">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-300"></div>冷库 A 区 (干茎与繁育种球)</span>
                    <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>检测正常</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                       <div className="text-xs text-slate-500 mb-1 font-medium">当前温度</div>
                       <div className="text-3xl font-mono font-bold text-emerald-600">3.2<span className="text-sm ml-1 text-slate-500 font-sans">°C</span></div>
                       <div className="text-[10px] text-slate-400 mt-2 tracking-wide font-mono">标准阈值: 1°C ~ 5°C</div>
                     </div>
                     <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                       <div className="text-xs text-slate-500 mb-1 font-medium">当前湿度</div>
                       <div className="text-3xl font-mono font-bold text-emerald-600">70<span className="text-sm ml-1 text-slate-500 font-sans">%</span></div>
                       <div className="text-[10px] text-slate-400 mt-2 tracking-wide font-mono">标准阈值: 60% ~ 75%</div>
                     </div>
                  </div>
                </div>
             </div>
          </div>
        </div>

      {/* Inventory & Consumable Write-off Module */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 gap-4 flex-col sm:flex-row">
           <div>
             <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
               <div className="p-1.5 bg-sky-100 text-sky-600 rounded-lg">
                 <Server className="w-4 h-4" />
               </div>
               设备与耗材智能调度仓储
             </h3>
             <p className="text-xs text-slate-500 mt-1">基于业务系统自动追踪与扣减耗材库存，支持预警与自动请购</p>
           </div>
          <button className="text-xs bg-white text-slate-700 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-50 transition-colors border border-slate-200 shadow-sm whitespace-nowrap">
            手工盘点录入入口
          </button>
        </div>
        <div className="flex-1 overflow-x-auto p-0">
           <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[10px] text-slate-500 uppercase bg-slate-50/80 border-b border-slate-100 shadow-sm sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3 font-medium">物资材料名称</th>
                <th className="px-5 py-3 font-medium">当前物理库存</th>
                <th className="px-5 py-3 font-medium">智能核销用量 (近7日)</th>
                <th className="px-5 py-3 font-medium">系统状态及自动化诊断</th>
                <th className="px-5 py-3 font-medium text-right">操作管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 whitespace-nowrap">
              <tr className="hover:bg-sky-50/30 transition-colors">
                <td className="px-5 py-4">
                   <div className="font-semibold text-slate-800 text-xs text-ellipsis overflow-hidden max-w-[150px]" title="复合氨基酸水溶肥">复合氨基酸水溶肥</div>
                   <div className="text-[10px] text-slate-500 mt-0.5">基础肥料</div>
                </td>
                <td className="px-5 py-4 min-w-[150px]">
                   <div className="flex justify-between items-end mb-1">
                     <span className="font-mono text-emerald-600 font-bold text-xs">450 <span className="text-[10px] text-slate-500 font-normal">kg</span></span>
                     <span className="text-[10px] text-slate-400 font-bold">90%</span>
                   </div>
                   <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                     <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '90%' }}></div>
                   </div>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                   <span className="text-red-500 font-bold font-mono">-25.5 kg</span>
                   <div className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate" title="由区域自动记录">关联订单同步扣减</div>
                </td>
                <td className="px-5 py-4"><span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-[10px] border border-emerald-200 font-bold">库存水位健康</span></td>
                <td className="px-5 py-4 text-right"><button className="text-[10px] text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors font-medium">查看流水账目</button></td>
              </tr>
              <tr className="hover:bg-red-50/20 transition-colors bg-red-50/10">
                <td className="px-5 py-4">
                   <div className="font-semibold text-slate-800 text-xs text-ellipsis overflow-hidden max-w-[150px]" title="阿维菌素悬浮剂(200ml)">阿维菌素悬浮剂(200ml)</div>
                   <div className="text-[10px] text-slate-500 mt-0.5">农药(杀虫剂)</div>
                </td>
                <td className="px-5 py-4 min-w-[150px]">
                   <div className="flex justify-between items-end mb-1">
                     <span className="font-mono text-red-600 font-bold text-xs">15 <span className="text-[10px] text-slate-500 font-normal">瓶</span></span>
                     <span className="text-[10px] text-red-500 font-bold">10%</span>
                   </div>
                   <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden relative shadow-inner">
                     <div className="absolute inset-0 bg-red-100"></div>
                     <div className="absolute top-0 left-0 bg-red-500 h-2 rounded-full animate-pulse" style={{ width: '10%' }}></div>
                   </div>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                   <span className="text-red-500 font-bold font-mono">-42 瓶</span>
                   <div className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate" title="红薯粉虱防治期">粉虱集中防治期高发</div>
                </td>
                <td className="px-5 py-4 min-w-[200px]">
                  <div className="flex items-center gap-1.5 text-red-700 text-[10px] font-bold bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 w-max">
                    <AlertTriangle className="w-3.5 h-3.5" /> 低于安全库存，已触发自动请购单
                  </div>
                </td>
                <td className="px-5 py-4 text-right"><button className="text-[10px] text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-colors border border-indigo-700">跟进采购审批</button></td>
              </tr>
              <tr className="hover:bg-sky-50/30 transition-colors">
                <td className="px-5 py-4">
                   <div className="font-semibold text-slate-800 text-xs text-ellipsis overflow-hidden max-w-[150px]" title="定制热敏溯源标签(卷)">定制热敏防伪溯源标签</div>
                   <div className="text-[10px] text-slate-500 mt-0.5">特殊包装耗材</div>
                </td>
                <td className="px-5 py-4 min-w-[150px]">
                   <div className="flex justify-between items-end mb-1">
                     <span className="font-mono text-emerald-600 font-bold text-xs">1,200 <span className="text-[10px] text-slate-500 font-normal">卷</span></span>
                     <span className="text-[10px] text-slate-400 font-bold">80%</span>
                   </div>
                   <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                     <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '80%' }}></div>
                   </div>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                   <span className="text-red-500 font-bold font-mono">-30 卷</span>
                   <div className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate" title="大理基地发货打印">大理基地发货云打印</div>
                </td>
                <td className="px-5 py-4"><span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-[10px] border border-emerald-200 font-bold">库存水位健康</span></td>
                <td className="px-5 py-4 text-right"><button className="text-[10px] text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors font-medium">查看流水账目</button></td>
              </tr>
            </tbody>
           </table>
        </div>
      </div>
      </div>

      {/* System Audit Logs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col mt-6 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 gap-4">
           <div>
             <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                系统级操作审计日志
             </h3>
             <p className="text-xs text-slate-500 mt-1">监控平台全部敏感核心操作并存入区块链溯源。不可篡改，永久留存。</p>
           </div>
           <button className="text-xs border border-slate-200 text-slate-700 bg-white px-4 py-2.5 rounded-xl hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm font-bold whitespace-nowrap flex items-center gap-2">
             <Download className="w-3.5 h-3.5 text-slate-400" />
             导出 PDF 报告
           </button>
        </div>
        <div className="overflow-x-auto p-0 max-h-80">
           <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[10px] text-slate-500 uppercase bg-slate-50/80 sticky top-0 shadow-sm z-10 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 font-medium">时间戳</th>
                <th className="px-5 py-3 font-medium">操作账号 (角色)</th>
                <th className="px-5 py-3 font-medium">事件分类</th>
                <th className="px-5 py-3 font-medium">详情描述</th>
                <th className="px-5 py-3 font-medium">IP 与终端</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50 text-xs font-mono">
              <tr className="hover:bg-indigo-50/30 transition-colors">
                <td className="px-5 py-3.5 text-slate-500 text-[10px]">2026-06-12 14:02:11</td>
                <td className="px-5 py-3.5 text-slate-800 font-bold">admin_root <span className="text-slate-400 font-normal"> (SuperAdmin)</span></td>
                <td className="px-5 py-3.5 text-indigo-600 font-medium">系统配置变更</td>
                <td className="px-5 py-3.5 text-slate-600">启用了 <span className="font-bold text-slate-700">[强制全员双重认证 (2FA)]</span></td>
                <td className="px-5 py-3.5 text-slate-400 text-[10px]">192.168.1.1 (Mac OS)</td>
                <td className="px-5 py-3.5"><span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[10px]">成功</span></td>
              </tr>
              <tr className="hover:bg-indigo-50/30 transition-colors bg-slate-50/30">
                <td className="px-5 py-3.5 text-slate-500 text-[10px]">2026-06-12 13:45:00</td>
                <td className="px-5 py-3.5 text-slate-800 font-bold">system_bot_1 <span className="text-slate-400 font-normal"> (System)</span></td>
                <td className="px-5 py-3.5 text-indigo-600 font-medium flex items-center gap-1.5"><DatabaseBackup className="w-3.5 h-3.5" /> 智能合约</td>
                <td className="px-5 py-3.5 text-slate-600">触发农残定期公示快照备份 <span className="text-slate-400 ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] break-all">TxHash: 0x6...ab2</span></td>
                <td className="px-5 py-3.5 text-slate-400 text-[10px]">内部触发</td>
                <td className="px-5 py-3.5"><span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[10px]">链上确认</span></td>
              </tr>
              <tr className="hover:bg-red-50/30 transition-colors bg-red-50/10">
                <td className="px-5 py-3.5 text-slate-500 text-[10px]">2026-06-12 11:20:15</td>
                <td className="px-5 py-3.5 text-slate-800 font-bold text-red-600">agent_002 <span className="text-slate-400 font-normal text-slate-500"> (二级代理)</span></td>
                <td className="px-5 py-3.5 text-red-600 font-medium flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> 越权访问尝试</td>
                <td className="px-5 py-3.5 text-slate-600 truncate max-w-[250px]" title="尝试调取跨区核销数据被拦截。">尝试调取跨区核销数据被拦截。</td>
                <td className="px-5 py-3.5 text-slate-400 text-[10px]">221.3.14.88 (iOS Safari)</td>
                <td className="px-5 py-3.5"><span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100 text-[10px]">拦截告警</span></td>
              </tr>
              <tr className="hover:bg-indigo-50/30 transition-colors">
                <td className="px-5 py-3.5 text-slate-500 text-[10px]">2026-06-12 09:12:08</td>
                <td className="px-5 py-3.5 text-slate-800 font-bold">finance_auditor <span className="text-slate-400 font-normal"> (FinanceAdmin)</span></td>
                <td className="px-5 py-3.5 text-emerald-600 font-medium">财务审批</td>
                <td className="px-5 py-3.5 text-slate-600">通过了 <span className="font-bold text-slate-700">[华东大区花市总代]</span> 的10万枚标签申领请求。</td>
                <td className="px-5 py-3.5 text-slate-400 text-[10px]">113.88.24.120 (Chrome Windows)</td>
                <td className="px-5 py-3.5"><span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[10px]">成功</span></td>
              </tr>
            </tbody>
           </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">安全二次确认</h3>
              </div>
              <button onClick={() => setShowConfirmModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-50/50">
              <p className="text-sm text-slate-600 mb-4">
                您正在尝试进行敏感权限操作：<br/>
                <span className="font-bold text-slate-800 block mt-3 p-4 bg-white rounded-xl border border-amber-200 shadow-sm text-base text-center">
                  {actionPending}
                </span>
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                此操作可能影响系统的正常审批流与数据安全。已通过区块链留存审计记录，请确认是否继续？
              </p>
            </div>
            <div className="p-5 bg-white border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmAction}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors shadow-sm focus:ring-4 focus:ring-amber-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : null}
                确认并执行操作
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Confirm Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${batchActionType === '驳回' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                   <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">批量操作确认</h3>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-50/50">
              <p className="text-sm text-slate-600 mb-4 text-center">
                您已选中 <span className={`font-bold ${batchActionType === '驳回' ? 'text-red-600' : 'text-emerald-600'} text-lg px-2 py-0.5 bg-white border rounded shadow-sm mx-1`}>{selectedAgents.size}</span> 个机构节点进行批量审批。
              </p>
              <div className="text-sm text-slate-800 font-medium bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
                确认将选定的节点池批量执行 <span className={`font-bold px-2 py-1 rounded text-white ${batchActionType === '驳回' ? 'bg-red-500' : 'bg-emerald-500'} ml-1`}>{batchActionType}</span> 操作？
              </div>
            </div>
            <div className="p-5 bg-white border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowBatchModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                放弃操作
              </button>
              <button 
                onClick={confirmBatchAction}
                disabled={isProcessing}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-colors shadow-sm focus:ring-4 ${batchActionType === '驳回' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500/20' : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/20'} disabled:opacity-50 flex items-center gap-2`}
              >
                {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : null}
                立即{batchActionType}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </motion.div>
  );
}
