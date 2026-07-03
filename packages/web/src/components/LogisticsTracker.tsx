import { PackageSearch, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Role } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listSupplies, createSupply, issueSupply, deleteSupply } from '../api/supply';
import { listBatches } from '../api/batches';
import { useAuth } from '../auth/auth-context';

export default function LogisticsTracker() {
  const { user } = useAuth();
  const isMerchant = user?.role === Role.MERCHANT;
  const { data: supplies, loading: suppliesLoading, error: suppliesError, reload: reloadSupplies } = useApi(listSupplies);
  const { data: batches, loading: batchesLoading, error: batchesError } = useApi(listBatches);
  const [showInboundModal, setShowInboundModal] = useState(false);
  const [showOutboundModal, setShowOutboundModal] = useState(false);

  // Issue/registration form states
  const [issuePayload, setIssuePayload] = useState({ supplyId: '', amount: 0, batchId: '' });
  const [inboundPayload, setInboundPayload] = useState({ name: '', amount: 0, unit: '箱' });

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleIssueSubmit = async () => {
    if (!isMerchant) return showToast('当前视图只读');
    if (!issuePayload.supplyId || issuePayload.amount <= 0) return showToast('请输入完整信息');
    if (!issuePayload.batchId) return showToast('请选择关联批次');
    try {
      await issueSupply(issuePayload.supplyId, { batchId: issuePayload.batchId, amount: issuePayload.amount });
      setShowOutboundModal(false);
      setIssuePayload({ supplyId: '', amount: 0, batchId: '' });
      showToast('领用单下发成功');
      await reloadSupplies();
    } catch (e: any) {
      showToast(e?.message || '领用失败(可能超量熔断)');
    }
  };

  const handleInboundSubmit = async () => {
    if (!isMerchant) return showToast('当前视图只读');
    if (!inboundPayload.name || inboundPayload.amount <= 0) return showToast('请输入完整信息');
    try {
      await createSupply({ name: inboundPayload.name, unit: inboundPayload.unit, amount: inboundPayload.amount });
      setShowInboundModal(false);
      setInboundPayload({ name: '', amount: 0, unit: '箱' });
      showToast('农资入库完成');
      await reloadSupplies();
    } catch (e: any) {
      showToast(e?.message || '入库失败');
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <PackageSearch className="w-6 h-6 text-cyan-600" />
            农资投入品管理
          </h2>
          <p className="text-xs text-slate-500 mt-1">农资出入库登记,并与农事实操(扫码打卡)自动关联对账,防止超量违规使用</p>
        </div>
      </motion.div>

      <div className="flex-1 min-h-0">
        <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="bg-white rounded-xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-lg flex flex-col h-full overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
             <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                   <PackageSearch className="w-5 h-5 text-cyan-600" />
                   农资投入品库存与自动对账
                </h3>
                <p className="text-xs text-slate-500 mt-1">系统已将农事实操(扫码打卡)自动与此库存领用扣减关联对账,防止超量违规使用。</p>
             </div>
             <div className="flex gap-3">
                {isMerchant ? (
                  <>
                    <button onClick={() => setShowInboundModal(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all shadow-sm">
                       入库登记
                    </button>
                    <button onClick={() => setShowOutboundModal(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm hover:bg-cyan-700 transition-all hover:-translate-y-0.5">
                       <Plus className="w-4 h-4" /> 领用下达
                    </button>
                  </>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">只读视图</span>
                )}
             </div>
          </div>

          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
               <div className="bg-cyan-50/50 border border-cyan-100 p-4 rounded-xl flex items-start gap-3">
                  <ShieldCheck className="w-8 h-8 text-cyan-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">防超额校验机制开启</h4>
                    <p className="text-xs text-slate-500 mt-1">现场打卡记录的化肥实际消耗将与库存出账单比对,用量超出110%即刻熔断并报警。</p>
                  </div>
               </div>
            </div>

            <h4 className="font-bold text-slate-700 text-sm mb-4">投入品台账</h4>
            {suppliesLoading && <p className="text-sm text-slate-400">加载中...</p>}
            {suppliesError && <p className="text-sm text-red-600">{suppliesError}</p>}
            <div className="space-y-3">
               <AnimatePresence>
               {(supplies ?? []).map((item, idx) => (
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
                              <span className={`font-bold ${item.alert ? 'text-red-600' : 'text-slate-700'}`}>{item.remaining}</span>
                           </div>
                           <div className="h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-1000 ${item.alert ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${(item.used / item.total) * 100}%` }}></div>
                           </div>
                        </div>
                        {isMerchant && (
                          <button
                            onClick={async () => {
                              if (window.confirm('确认删除此农资记录吗?')) {
                                try {
                                  await deleteSupply(item.id);
                                  showToast(`已删除农资档案:${item.name}`);
                                  await reloadSupplies();
                                } catch (e: any) {
                                  showToast(e?.message || '删除失败');
                                }
                              }
                            }}
                            className="ml-4 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold transition-colors border border-red-200"
                          >
                            删除
                          </button>
                        )}
                     </div>
                  </motion.div>
               ))}
               </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {showInboundModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
           <motion.div initial={{scale:0.95, opacity:0}} animate={{scale:1, opacity:1}} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
              <h3 className="font-bold text-slate-800 text-lg mb-4">农资入库登记</h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">投入品名称</label>
                    <input type="text" value={inboundPayload.name} onChange={(e) => setInboundPayload({...inboundPayload, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="例如:复合肥" />
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
                       {(supplies ?? []).map(s => <option key={s.id} value={s.id}>{s.name} (剩余 {s.remaining} {s.unit})</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">关联生产批次</label>
                    <select
                      value={issuePayload.batchId}
                      onChange={(e) => setIssuePayload({...issuePayload, batchId: e.target.value})}
                      disabled={batchesLoading}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                       <option value="">-- 请选择批次 --</option>
                       {(batches ?? []).map(batch => (
                         <option key={batch.id} value={batch.id}>
                           {batch.batchNo} - {batch.cropName}{batch.ownerName ? ` / ${batch.ownerName}` : ''}
                         </option>
                       ))}
                    </select>
                    {batchesError && <p className="text-xs text-red-600 mt-1">批次加载失败:{batchesError}</p>}
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">本次下达/领用数量</label>
                    <input type="number" value={issuePayload.amount} onChange={(e) => setIssuePayload({...issuePayload, amount: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                 </div>
                 <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">库存预警与超量限制已开启,过量领用将被系统自动拦截熔断并记录审计。</p>
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
