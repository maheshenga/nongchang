import { useState } from 'react';
import { Users, Store, Activity, TrendingUp, Search, Plus, MapPin, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';

const SUB_MERCHANTS = [
  { id: 'M-1001', name: '大理有机芍药合作社', contact: '李建国', phone: '138****0001', fields: 4, area: '85.7', status: 'active', joinDate: '2025-03-12' },
  { id: 'M-1002', name: '昆明高山花卉基地', contact: '张华', phone: '139****1122', fields: 2, area: '45.0', status: 'active', joinDate: '2025-06-01' },
  { id: 'M-1003', name: '红河州特供农场', contact: '王五', phone: '137****3344', fields: 1, area: '20.5', status: 'pending', joinDate: '2026-01-15' },
];

export default function AgentPlatform() {
  const [merchants, setMerchants] = useState(SUB_MERCHANTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toastMessage, setToastMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const filteredMerchants = merchants.filter(m => {
    const matchQuery = m.name.includes(searchQuery) || m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.contact.includes(searchQuery);
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchQuery && matchStatus;
  });

  const handleBulkAction = (action: string) => {
    if (selectedIds.size === 0) return;
    
    if (action === 'delete') {
      setMerchants(merchants.filter(m => !selectedIds.has(m.id)));
      showToast(`已批量注销 ${selectedIds.size} 个节点`);
    } else if (action === 'activate') {
      setMerchants(merchants.map(m => selectedIds.has(m.id) ? { ...m, status: 'active' } : m));
      showToast(`已批量激活 ${selectedIds.size} 个节点`);
    } else if (action === 'suspend') {
      setMerchants(merchants.map(m => selectedIds.has(m.id) ? { ...m, status: 'pending' } : m));
      showToast(`已批量挂起 ${selectedIds.size} 个节点`);
    }
    setSelectedIds(new Set());
  };

  const handleInvite = () => {
    setIsProcessing(true);
    setTimeout(() => {
        setIsProcessing(false);
        const newMerchant = { 
          id: `M-10${Math.floor(Math.random()*100).toString().padStart(2, '0')}`, 
          name: ['安宁市优质芍药合作方', '昆明鲜切花进出口公司', '大理苍山生态花卉园'][Math.floor(Math.random()*3)], 
          contact: ['赵六', '孙七', '周八'][Math.floor(Math.random()*3)], 
          phone: `13${Math.floor(Math.random()*9+1)}****${Math.floor(Math.random()*9999).toString().padStart(4, '0')}`, 
          fields: Math.floor(Math.random()*5)+1, 
          area: (Math.random()*100 + 10).toFixed(1), 
          status: 'pending', 
          joinDate: new Date().toISOString().split('T')[0] 
        };
        setMerchants([newMerchant, ...merchants]);
        showToast('已生成入驻邀请链接，该商家（预分配ID）已增开系统档案');
    }, 800);
  };

  const handleAction = (id: string, action: string) => {
    if (action === '切换状态') {
      setMerchants(merchants.map(m => m.id === id ? { ...m, status: m.status === 'active' ? 'pending' : 'active' } : m));
      showToast('该商家节点状态已切换');
    } else if (action === '注销节点') {
      setMerchants(merchants.filter(m => m.id !== id));
      setSelectedIds(prev => {
        const newSel = new Set(prev);
        newSel.delete(id);
        return newSel;
      });
      showToast('该商家节点已被从系统拓扑中安全剥离');
    } else {
      const mName = merchants.find(m => m.id === id)?.name;
      showToast(`已成功执行：${action} [${mName}]`);
    }
  };

  const toggleSelect = (id: string) => {
      const newSel = new Set(selectedIds);
      if (newSel.has(id)) newSel.delete(id);
      else newSel.add(id);
      setSelectedIds(newSel);
  };

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) setSelectedIds(new Set(filteredMerchants.map(m => m.id)));
      else setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6 h-full flex flex-col overflow-y-auto pb-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">旗下商家总数</h3>
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><Store className="w-4 h-4" /></div>
          </div>
          <div className="text-3xl font-black text-slate-800">24<span className="text-sm font-medium text-slate-500 ml-1">家</span></div>
          <div className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> 较上月新增 2 家</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">总管理面积 (亩)</h3>
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><MapPin className="w-4 h-4" /></div>
          </div>
          <div className="text-3xl font-black text-slate-800">542.4</div>
          <div className="text-xs text-slate-500 font-medium mt-2">横跨 3 个州市</div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">当月累计生成防伪码</h3>
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600"><Activity className="w-4 h-4" /></div>
          </div>
          <div className="text-3xl font-black text-slate-800">12,500</div>
          <div className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +15.2%</div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-lg border border-slate-700 text-white flex flex-col justify-between">
           <div>
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">代理商账户状态</h3>
              <div className="flex items-center gap-2">
                 <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded">SVIP 代理</span>
                 <span className="px-2 py-0.5 bg-white/10 text-slate-300 text-xs font-bold rounded">合规存续</span>
              </div>
           </div>
           <div>
              <div className="text-sm font-bold text-white mb-1">可用配额：845,000 / 1,000,000</div>
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="w-[15%] h-full bg-emerald-500 rounded-full"></div>
              </div>
           </div>
        </div>
      </div>

      {/* Sub-merchants List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[400px]">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
           <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                 <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm">
                   <Users className="w-5 h-5" />
                 </div>
                 辖区内入驻商家管理
              </h2>
              <p className="text-xs text-slate-500 mt-1 tracking-wide">代理商系统：在此管理名下入驻的生产商、种植户与合作农企</p>
           </div>
           <div className="flex flex-col sm:flex-row sm:items-center gap-3">
             <div className="flex bg-white border border-slate-200 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all overflow-hidden items-center">
                 <div className="pl-4 pr-2 text-slate-400">
                    <Search className="w-4 h-4" />
                 </div>
                 <input 
                   type="text" 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   placeholder="检索商家名称或注册信源编码..." 
                   className="bg-transparent border-none focus:outline-none text-sm w-full sm:w-48 py-2 text-slate-700" 
                 />
                 <div className="h-4 w-px bg-slate-200 mx-1"></div>
                 <select 
                   value={statusFilter}
                   onChange={(e) => setStatusFilter(e.target.value)}
                   className="bg-transparent border-none text-sm focus:outline-none text-slate-600 py-2 pr-4 pl-2 cursor-pointer outline-none"
                 >
                   <option value="all">全部状态</option>
                   <option value="active">数据在营</option>
                   <option value="pending">网签待审</option>
                 </select>
             </div>
             
             {selectedIds.size > 0 && (
               <div className="flex gap-2">
                 <button onClick={() => handleBulkAction('activate')} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors border border-emerald-200">批量审批</button>
                 <button onClick={() => handleBulkAction('suspend')} className="bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors border border-amber-200">批量挂起</button>
                 <button onClick={() => handleBulkAction('delete')} className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors border border-red-200">批量注销</button>
               </div>
             )}

             <button 
               onClick={handleInvite}
               disabled={isProcessing}
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center gap-2 transition-all focus:ring-4 focus:ring-indigo-500/30 shrink-0 disabled:opacity-50"
             >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />}
                邀请新商家入驻系统
             </button>
           </div>
        </div>
        
        <div className="flex-1 overflow-x-auto min-h-0 bg-slate-50/30">
           <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-100/80 text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                 <tr>
                    <th className="px-6 py-4 font-bold border-b border-slate-200 w-12">
                       <input type="checkbox" className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" onChange={toggleAll} checked={selectedIds.size === filteredMerchants.length && filteredMerchants.length > 0} />
                    </th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200">注册商家主体 / 信用编号</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200">主联系人及预留电话</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200 text-right">登记地块总数</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200 text-right">确权核准总面积 (亩)</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200">当前经营状态</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200">首测入驻时间</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200 text-right">平台级控制权限</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {filteredMerchants.map((m) => (
                    <tr key={m.id} className={`hover:bg-indigo-50/10 transition-colors group ${selectedIds.has(m.id) ? 'bg-indigo-50/5' : ''}`}>
                       <td className="px-6 py-4 border-l-2 border-transparent group-hover:border-indigo-500">
                          <input type="checkbox" className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                       </td>
                       <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 text-sm flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-xs shrink-0">
                                {m.name.charAt(0)}
                             </div>
                             {m.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-1 ml-11 tracking-wider uppercase">ID: {m.id}</div>
                       </td>
                       <td className="px-6 py-4">
                          <div className="font-bold text-slate-700 text-sm flex items-center gap-1.5">{m.contact}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-1 opacity-80">{m.phone}</div>
                       </td>
                       <td className="px-6 py-4 font-black text-slate-700 text-right text-base">{m.fields}</td>
                       <td className="px-6 py-4 font-black font-mono text-indigo-600 text-right text-base">{m.area}</td>
                       <td className="px-6 py-4">
                          {m.status === 'active' ? (
                             <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider items-center inline-flex gap-1.5 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                数据在营
                             </span>
                          ) : (
                             <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider items-center inline-flex gap-1.5 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                网签待审
                             </span>
                          )}
                       </td>
                       <td className="px-6 py-4 text-xs font-mono text-slate-500">{m.joinDate}</td>
                       <td className="px-6 py-4 flex items-center justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleAction(m.id, '查看档案')} className="text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm cursor-pointer whitespace-nowrap">档案</button>
                          <button onClick={() => handleAction(m.id, '切换状态')} className="text-purple-600 bg-purple-50 border border-purple-100 hover:bg-purple-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm cursor-pointer whitespace-nowrap">切换状态</button>
                          <button onClick={() => handleAction(m.id, '注销节点')} className="text-red-600 bg-red-50 border border-red-100 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm cursor-pointer whitespace-nowrap">注销节点</button>
                       </td>
                    </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </div>
      
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
