import { ShieldCheck, Download, MoreHorizontal, X, Thermometer, Search, Server, DatabaseBackup, Settings, Activity, Lock, CheckCircle2, Store } from 'lucide-react';
import { Agent } from '../types';
import { useState, useMemo, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useApi } from '../hooks/useApi';
import { showToast } from '../hooks/useToast';
import { listAgents, createAgent, type Agent as ApiAgent } from '../api/agents';
import type { CreateAgentDto } from '@nongchang/shared';
import DemoBadge from './DemoBadge';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';

function toUiAgent(a: ApiAgent): Agent {
  return {
    id: a.id,
    name: a.name,
    level: '一级代理',
    region: a.region,
    sales: 0,
    status: a.status === 'active' ? 'Active' : 'Inactive',
  };
}


export default function SystemAdmin() {
  const { data: rawAgents, loading: agentsLoading, error: agentsError, reload: reloadAgents } = useApi(listAgents);
  const agents: Agent[] = useMemo(() => (rawAgents ?? []).map(toUiAgent), [rawAgents]);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  
  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const filteredAgents = useMemo(() => agents.filter(agent => {
    const matchQuery = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       agent.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       agent.parent?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || agent.status.toLowerCase() === statusFilter.toLowerCase();
    const matchLevel = levelFilter === 'all' || agent.level === levelFilter;
    return matchQuery && matchStatus && matchLevel;
  }), [agents, searchQuery, statusFilter, levelFilter]);

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
    if (selectedAgents.size === filteredAgents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(filteredAgents.map(a => a.id)));
    }
  };

  const handleBatchAction = (action: string) => {
    if (selectedAgents.size === 0) return;
    showToast(`批量[${action}]操作待后端接入`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 relative"
    >
      {showCreateAgent && <CreateAgentModal onClose={() => setShowCreateAgent(false)} onCreated={() => { setShowCreateAgent(false); void reloadAgents(); }} />}
      {/* System Command Center Header */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-[6px] p-6 text-slate-800 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                运营监控待接入
              </h2>
              <p className="text-sm text-slate-500 mt-1 max-w-3xl">
                暂无实时运营监控数据。当前版本没有真实服务器监控、链路节点、API 延迟或活跃商户实时接口，请接入真实监控 API 后再展示生产指标。
              </p>
              <div className="mt-2">
                <DemoBadge note="监控能力未接入" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 relative z-10">
            {[
              { label: '服务器监控', description: '待接入真实 APM / 基础设施监控 API' },
              { label: '链路节点', description: '待接入真实链路节点状态接口' },
              { label: '接口性能', description: '待接入真实网关延迟与错误率指标' },
              { label: '商户在线', description: '待接入真实商户会话或设备心跳数据' },
            ].map((item) => (
              <div key={item.label} className="rounded-[4px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-500">{item.label}</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">待接入</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-[6px] border border-slate-200 p-5 shadow-sm flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-2">监控数据源</p>
            <div className="text-lg font-black text-slate-800 tracking-tight">未配置</div>
            <div className="mt-2 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded w-max font-bold">等待后端接入</div>
          </div>

          <div className="bg-white rounded-[6px] border border-slate-200 p-5 shadow-sm flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-2">自动化告警</p>
            <div className="text-lg font-black text-slate-800 tracking-tight">未启用</div>
            <div className="mt-2 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded w-max font-bold">不生成模拟告警</div>
          </div>

          <div className="bg-white rounded-[6px] border border-slate-200 p-5 shadow-sm flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-2">运营审批提醒</p>
            <div className="text-lg font-black text-slate-800 tracking-tight">待接入</div>
            <div className="mt-2 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded w-max font-bold">不伪造未读数量</div>
          </div>

          <div className="bg-white rounded-[6px] border border-slate-200 p-5 shadow-sm flex flex-col justify-center">
            <p className="text-xs text-slate-500 font-medium mb-2">归档自动化</p>
            <div className="text-lg font-black text-slate-800 tracking-tight">未接入</div>
            <div className="mt-2 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded w-max font-bold">需真实任务状态</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Configs */}
        <div className="space-y-6">
          {/* Global Feature Management */}
          <div className="bg-white p-5 rounded-[6px] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">全局功能服务管理</h3>
                  <p className="text-xs text-slate-500 mt-0.5">仅展示配置入口；运行数据需接入真实服务接口后展示。</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { name: '系统级 AI 农业助理', note: '需接入真实 AI 调用统计与额度接口' },
                { name: 'IoT 物联网数据总线', note: '需接入真实设备运行接口' },
                { name: '消费者端防伪溯源 H5', note: '需接入真实扫码统计与访问分析接口' },
                { name: '跨国节点多语言支持', note: '模块尚未激活，需部署海外边缘节点' },
              ].map((feature) => (
                <div
                  key={feature.name}
                  aria-label={`${feature.name} 状态`}
                  className="flex flex-col gap-3 rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full bg-[#C8C6C4]"></div>
                      <div className="text-sm font-semibold text-[#242424]">{feature.name}</div>
                    </div>
                    <span className={fluentStatusTag('neutral')}>待接入</span>
                  </div>
                  <div className="text-xs leading-5 text-[#605E5C]">{feature.note}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Permission & Approval Config */}
          <div className="bg-white p-5 rounded-[6px] border border-slate-200 shadow-sm">
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
                { role: '养护/质检数据归档', assignees: '基地质检员, 芍药圃主管', required: false },
              ].map((flow) => (
                <div
                  key={flow.role}
                  className="flex flex-col gap-2.5 rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#242424]">{flow.role}</span>
                    {flow.required ? (
                      <span className={fluentStatusTag('warning')}>
                        <Lock className="h-3 w-3" /> 需双重验证
                      </span>
                    ) : (
                      <span className={fluentStatusTag('neutral')}>
                        <CheckCircle2 className="h-3 w-3" /> 策略待接入
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#605E5C]">
                    <span>流转节点:</span>
                    <span className="font-semibold text-[#242424]">{flow.assignees}</span>
                  </div>
                </div>
              ))}
              
              <div className="rounded-[4px] border border-dashed border-[#C8C6C4] bg-white px-3 py-2 text-xs font-semibold text-[#605E5C]">
                新审批流配置接口待接入
              </div>
            </div>
          </div>

          {/* Global Configuration Panel */}
          <div className="bg-white p-5 rounded-[6px] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 text-slate-600 rounded-lg">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">平台全局安全与策略</h3>
                  <p className="text-xs text-slate-500 mt-0.5">平台安全策略配置入口</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-[4px] border border-[#E1DFDD] bg-white p-4">
                 <div className="flex items-center justify-between gap-3">
                   <div className="text-sm font-semibold text-[#242424]">强制全员双重认证 (2FA)</div>
                   <span className={fluentStatusTag('neutral')}>接口待接入</span>
                 </div>
                 <div className="mt-2 text-xs text-[#605E5C]">需要真实认证服务和租户策略接口后再允许启停。</div>
              </div>
              <div className="rounded-[4px] border border-[#E1DFDD] bg-white p-4">
                 <div className="flex items-center justify-between gap-3">
                   <div className="text-sm font-semibold text-[#242424]">严格防伪溯源流转模式</div>
                   <span className={fluentStatusTag('neutral')}>接口待接入</span>
                 </div>
                 <div className="mt-2 text-xs text-[#605E5C]">需要真实出入库流转校验接口后再允许启停。</div>
              </div>

              <div className="h-px w-full bg-[#EDEBE9] my-2"></div>
              
              <div className="flex items-center justify-center gap-2 rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-3 text-xs font-semibold text-[#605E5C]">
                 <DatabaseBackup className="h-4 w-4 text-[#605E5C]" />
                 备份任务接口待接入
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Agents & Distributors List */}
        <div className="lg:col-span-2 bg-white rounded-[6px] border border-slate-200 shadow-sm flex flex-col h-[760px] overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                  <Store className="w-4 h-4" />
                </div>
                芍药分销代理商网络管理
              </h3>
              <p className="text-xs text-slate-500 mt-1">代理商列表来自真实接口；层级与流通追踪按后端接口接入情况展示。</p>
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
              <button onClick={() => setShowCreateAgent(true)} className={fluentButton('primary')}>
                新增代理
              </button>
              <button className={fluentButton('secondary')}>
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
                className={`${fluentInput} w-full pl-9`}
              />
            </div>
             <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={fluentSelect}>
                <option value="all">所有网络状态</option>
                <option value="active">正常运作节点</option>
                <option value="pending">待审批加入网络</option>
                <option value="inactive">已冻结/异常节点</option>
             </select>
             <select 
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className={fluentSelect}>
                <option value="all">分级网络 (全部级别)</option>
                <option value="一级代理">L1 核心代理节点 (一级代理)</option>
                <option value="二级代理">L2 区域分销节点 (二级代理)</option>
                <option value="三级网点">终端自营/加盟网点 (三级网点)</option>
             </select>
          </div>
          
          <div className="flex-1 overflow-x-auto p-0 min-h-0 bg-slate-50/30">
             {agentsLoading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
             {agentsError && <div className="p-8 text-center text-rose-500 text-sm">{agentsError} <button onClick={() => void reloadAgents()} className="underline font-bold ml-2">重试</button></div>}
             <table className={fluentTable.table}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={`${fluentTable.th} w-12`}>
                    <input
                      type="checkbox"
                      checked={selectedAgents.size === filteredAgents.length && filteredAgents.length > 0}
                      onChange={handleSelectAllAgents}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className={fluentTable.th}>代理商机构识别信息</th>
                  <th className={fluentTable.th}>网络级别及上游节点</th>
                  <th className={fluentTable.th}>授权流通区域</th>
                  <th className={fluentTable.th}>异常扫码监控阈值</th>
                  <th className={fluentTable.th}>节点流通量/销售业绩估算</th>
                  <th className={fluentTable.th}>连通状态</th>
                  <th className={`${fluentTable.th} text-right`}>操作管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className={`${fluentTable.row} group`}>
                    <td className={`${fluentTable.td} border-l-2 border-transparent group-hover:border-blue-500`}>
                      <input 
                        type="checkbox" 
                        checked={selectedAgents.has(agent.id)}
                        onChange={() => handleSelectAgent(agent.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className={fluentTable.td}>
                      <div className="font-bold text-slate-800 text-sm">{agent.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono hover:text-blue-600 transition-colors cursor-pointer w-max">Node ID: {agent.id}</div>
                    </td>
                    <td className={fluentTable.td}>
                      <div className="flex flex-col gap-1.5 flex-start">
                        <span className="font-bold text-blue-700 bg-blue-100 w-max px-2.5 py-1 rounded-md text-[10px] border border-blue-200 uppercase tracking-widest shadow-sm">{agent.level}</span>
                        {agent.parent && <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium"><span className="w-1.5 h-1.5 bg-slate-300 rounded-full group-hover:bg-blue-400 transition-colors"></span> 上级: {agent.parent}</span>}
                      </div>
                    </td>
                    <td className={`${fluentTable.td} max-w-[150px] truncate text-xs text-[#605E5C]`} title={agent.region}>{agent.region}</td>
                    <td className={fluentTable.td}>
                      <div className="flex items-center gap-2">
                        <input type="number" defaultValue="5000" className={`${fluentInput} w-[80px] font-mono font-bold`} />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">次 / 异常</span>
                      </div>
                    </td>
                    <td className={`${fluentTable.td} text-sm font-semibold text-[#107C10]`}>¥ {agent.sales.toLocaleString()}</td>
                    <td className={fluentTable.td}>
                      {agent.status === 'Active' && <span className={fluentStatusTag('success')}>正常在网</span>}
                      {agent.status === 'Pending' && <span className={fluentStatusTag('warning')}>接入审核中</span>}
                      {agent.status === 'Inactive' && <span className={fluentStatusTag('neutral')}>连接处于冻结/断开</span>}
                    </td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <span className="rounded-[4px] border border-[#E1DFDD] bg-white px-3 py-1.5 text-xs font-semibold text-[#605E5C]">数据穿透待接入</span>
                        <span className="rounded-[4px] border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-1.5 text-xs font-semibold text-[#605E5C]">权属调整待接入</span>
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
        <div className="bg-white rounded-[6px] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
             <div>
               <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Thermometer className="w-4 h-4"/>
                </div>
                仓储环境监测待接入
               </h3>
               <p className="text-xs text-slate-500 mt-1">暂无实时仓储环境数据。接入真实传感器接口前，不展示温湿度、异常状态或自动推送结果。</p>
             </div>
          </div>
          <div className="p-5 flex flex-col gap-4 bg-slate-50 flex-1">
             <div className="rounded-[4px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
               当前未配置仓储传感器数据源。请接入真实 IoT / WMS 监控 API 后，再启用温湿度阈值、告警和自动化处置展示。
             </div>
             <div className="flex flex-col gap-4">
                {['冷库 B 区 (鲜切花暂存区)', '冷库 A 区 (干茎与繁育种球)'].map((name) => (
                  <div key={name} className="p-5 border border-slate-200 bg-white shadow-sm rounded-[4px] transition-colors">
                    <div className="text-sm font-bold text-slate-700 mb-4 flex justify-between items-center">
                      <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-300"></div>{name}</span>
                      <span className="text-slate-600 text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">待接入</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 rounded-[4px] bg-slate-50 border border-slate-100">
                         <div className="text-xs text-slate-500 mb-1 font-medium">温度数据</div>
                         <div className="text-base font-bold text-slate-700">暂无实时数据</div>
                         <div className="text-[10px] text-slate-400 mt-2 tracking-wide">等待真实传感器接口</div>
                       </div>
                       <div className="p-4 rounded-[4px] bg-slate-50 border border-slate-100">
                         <div className="text-xs text-slate-500 mb-1 font-medium">湿度数据</div>
                         <div className="text-base font-bold text-slate-700">暂无实时数据</div>
                         <div className="text-[10px] text-slate-400 mt-2 tracking-wide">等待真实传感器接口</div>
                       </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      {/* Inventory & Consumable Write-off Module */}
      <div className="bg-white rounded-[6px] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 gap-4 flex-col sm:flex-row">
           <div>
             <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
               <div className="p-1.5 bg-sky-100 text-sky-600 rounded-lg">
                 <Server className="w-4 h-4" />
               </div>
               设备与耗材调度待接入
             </h3>
             <p className="text-xs text-slate-500 mt-1">暂无真实库存、核销、预警或请购自动化接口；接入 WMS/ERP 后再展示库存水位和处置状态。</p>
           </div>
          <span className={fluentStatusTag('neutral')}>录入接口待接入</span>
        </div>
        <div className="p-5 bg-slate-50">
          <div className="rounded-[4px] border border-slate-200 bg-white p-5 text-sm text-slate-600">
            库存台账、耗材核销、低库存提醒和自动请购需要真实后端数据源。当前页面不展示模拟库存数量或自动化结论。
          </div>
        </div>
      </div>
      </div>
      {/* System Audit Logs */}
      <div className="bg-white rounded-[6px] border border-slate-200 shadow-sm flex flex-col mt-6 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 gap-4">
           <div>
             <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                系统级操作审计待接入
             </h3>
             <p className="text-xs text-slate-500 mt-1">暂无真实审计日志接口。接入后端审计服务前，不展示模拟账号、IP、交易哈希或成功状态。</p>
           </div>
           <span className={fluentStatusTag('neutral')}>导出报告待接入</span>
        </div>
        <div className="p-5 bg-slate-50">
          <div className="rounded-[4px] border border-slate-200 bg-white p-5 text-sm text-slate-600">
            操作审计、留存策略和报告导出均需真实后端接口支持。当前不提供可执行审计导出动作，也不伪造历史日志。
          </div>
        </div>
      </div>

    </motion.div>
  );
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setSubmitting(true);
    try {
      const dto: CreateAgentDto = { name, region };
      await createAgent(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally { setSubmitting(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-agent-title">
      <form onSubmit={submit} className="bg-white rounded-[6px] shadow-sm w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="create-agent-title" className="font-bold text-slate-800 text-lg">新增代理商</h3>
          <button type="button" onClick={onClose} aria-label="关闭" className={fluentButton('icon')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label htmlFor="create-agent-name" className="block text-xs font-bold text-slate-500">名称</label>
          <input id="create-agent-name" value={name} onChange={(e) => setName(e.target.value)} required
            className={`${fluentInput} mt-1 w-full`} />
        </div>
        <div>
          <label htmlFor="create-agent-region" className="block text-xs font-bold text-slate-500">区域</label>
          <input id="create-agent-region" value={region} onChange={(e) => setRegion(e.target.value)} required
            className={`${fluentInput} mt-1 w-full`} />
        </div>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={fluentButton('secondary')}>取消</button>
          <button type="submit" disabled={submitting}
            className={fluentButton('primary')}>
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
