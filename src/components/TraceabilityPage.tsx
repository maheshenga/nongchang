import { useState, useEffect } from 'react';
import { ShieldCheck, MapPin, Calendar, Sprout, Truck, Store, Map, Leaf, ArrowLeft, Hexagon, Droplet, Sun, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MOCK_JOURNEY = [
  { id: 1, type: 'origin', title: '种苗培育', time: '2023-04-12 09:30', location: '云南大理白族自治州·核心育种基地', actor: '李农技 (高级农艺师)', icon: Sprout, desc: '从顶级种源区引入，采用脱毒快繁技术进行室内组培。', image: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2636?q=80&w=400&h=300&fit=crop' },
  { id: 2, type: 'farm', title: '大田移栽', time: '2023-10-15 14:00', location: '云南大理·A区露地', actor: '张师傅 (种植队长)', icon: Leaf, desc: '完成秋季移栽，定植密度合理，采用滴灌系统。', weather: '晴 24°C / 湿度 45%' },
  { id: 3, type: 'farm', title: '智能水肥记录', time: '2024-03-20 10:15', location: '云南大理·A区露地', actor: '系统自动执行', icon: Droplet, desc: 'IoT传感器触发缺水预警，自动滴灌系统补水2小时，并追施专用缓释肥。', data: '土壤湿度从 32% 提升至 55%' },
  { id: 4, type: 'harvest', title: '熟期采收', time: '2026-05-10 07:00', location: '云南大理·A区露地', actor: '王大姐等12人', icon: Sun, desc: '达到最佳采收成熟度（花蕾圆润，微微显色），清晨露水干后人工采摘，避免机械损伤。', image: 'https://images.unsplash.com/photo-1496843916299-590492c724f8?q=80&w=400&h=300&fit=crop' },
  { id: 5, type: 'warehouse', title: '冷链入库与分级', time: '2026-05-10 11:30', location: '大理鲜切花产地加工中心', actor: '检验员007', icon: Hexagon, desc: '修剪多余枝叶，按A级标准（杆长>60cm, 花苞一致）分级，并进行保鲜液处理。入库温度预冷至 2-4°C。', tag: 'A级精品' },
  { id: 6, type: 'logistics', title: '冷链干线运输', time: '2026-05-11 08:20', location: '大理 -> 昆明斗南', actor: '顺丰冷链车 (云A·88888)', icon: Truck, desc: '全程温湿度监控，保持2-6°C冷链运输。', temp: '4.2°C (正常)' },
  { id: 7, type: 'retail', title: '抵达零售端', time: '2026-05-12 10:00', location: '昆明市呈贡区花卉市场直营店', actor: '门店店长', icon: Store, desc: '验收合格，入冰柜展示售卖。等待有缘人购买。' }
];

export default function TraceabilityPage({ code, onBack }: { code: string, onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState<'journey' | 'cert' | 'data'>('journey');
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Simulate blockchain verification
    const timer = setTimeout(() => setIsVerifying(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-900 pb-12">
      {/* Header Banner */}
      <div className="relative bg-emerald-900 text-white overflow-hidden pb-12 rounded-b-[2.5rem]">
         <div className="absolute inset-0 opacity-20">
            <img src="https://images.unsplash.com/photo-1563241527-3004b7be0ffd?q=80&w=1200&h=600&fit=crop" alt="Peony Farm" className="w-full h-full object-cover" />
         </div>
         <div className="absolute inset-0 bg-gradient-to-t from-emerald-900 via-emerald-900/80 to-transparent"></div>
         
         <div className="relative px-5 pt-8 z-10 max-w-lg mx-auto">
            <div className="flex justify-between items-center mb-8">
               {onBack ? (
                 <button onClick={onBack} className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur transition-colors">
                    <ArrowLeft className="w-5 h-5 text-white" />
                 </button>
               ) : (
                 <div className="w-9 h-9"></div>
               )}
               <div className="font-bold tracking-widest text-emerald-100 text-sm flex items-center gap-1.5"><ShieldCheck className="w-4 h-4"/> 官方溯源档案</div>
               <div className="w-9 h-9"></div>
            </div>

            <div className="text-center mb-6">
               <span className="inline-block px-3 py-1 bg-emerald-400/20 border border-emerald-400/30 rounded-full text-emerald-200 text-xs font-bold font-mono mb-4 backdrop-blur-sm shadow-inner">
                  {code}
               </span>
               <h1 className="text-3xl font-black mb-2 tracking-tight">极品春白芍大雪素</h1>
               <div className="flex items-center justify-center gap-4 text-emerald-100/80 text-sm font-medium">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/> 云南大理</span>
                  <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/> 2026年头茬</span>
               </div>
            </div>

            {/* Validation Card */}
            <div className="bg-white rounded-2xl p-5 shadow-2xl relative overflow-hidden text-center mt-8 -mb-20 transform translate-y-12 ring-4 ring-white/10">
               {isVerifying ? (
                 <div className="flex flex-col items-center justify-center py-4">
                    <div className="relative w-12 h-12 mb-4">
                        <div className="absolute inset-0 border-4 border-emerald-100 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
                        <Hexagon className="absolute inset-0 m-auto text-emerald-500 w-5 h-5 opacity-50" />
                    </div>
                    <div className="font-bold text-slate-700">正在与区块链节点效验...</div>
                    <div className="text-xs text-slate-400 mt-1 font-mono">Verifying block integrity & signatures</div>
                 </div>
               ) : (
                 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-4">
                    <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                       <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">正品认证通过</h2>
                    <p className="text-sm text-slate-500 mb-4 px-4 line-clamp-2">此溯源码由区块链不可篡改加密存证，信息真实有效。感谢您选择高品质原产地鲜花。</p>
                    <div className="w-full bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-left">
                       <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">扫码时间</div>
                          <div className="text-xs font-mono font-medium text-slate-700">{new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}</div>
                       </div>
                       <div className="pl-2 border-l border-slate-200">
                          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">区块链存证 HASH</div>
                          <div className="text-xs font-mono font-medium text-emerald-600 truncate">0x9d4b...3f1a</div>
                       </div>
                    </div>
                 </motion.div>
               )}
            </div>
         </div>
      </div>

      {/* Main Content Body */}
      <div className="max-w-lg mx-auto pt-28 px-5">
         
         {/* Tabs */}
         <div className="flex bg-white rounded-full p-1 shadow-sm mb-8 sticky top-4 z-20 border border-slate-200">
            {[{id: 'journey', label: '生命旅程'}, {id: 'cert', label: '质检证书'}, {id: 'data', label: '产地数据'}].map(t => (
               <button 
                 key={t.id} 
                 onClick={() => setActiveTab(t.id as any)}
                 className={`flex-1 py-2.5 text-sm font-bold rounded-full transition-all ${activeTab === t.id ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 {t.label}
               </button>
            ))}
         </div>

         {/* Journey Tab */}
         <AnimatePresence mode="wait">
            {activeTab === 'journey' && (
              <motion.div 
                 key="journey"
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0 }}
                 className="space-y-6"
              >
                 <div className="relative pl-8 before:absolute before:inset-0 before:ml-[1.18rem] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-emerald-200 before:via-emerald-400/50 before:to-emerald-200/20">
                    {MOCK_JOURNEY.map((event, idx) => {
                       const Icon = event.icon;
                       return (
                          <div key={event.id} className="relative mb-10 last:mb-0 group">
                             <div className={`absolute left-[-2.05rem] w-8 h-8 rounded-full border-4 border-slate-50 flex items-center justify-center shrink-0 z-10 shadow-sm transition-transform duration-300 group-hover:scale-110 ${idx === MOCK_JOURNEY.length - 1 ? 'bg-emerald-500' : 'bg-white'}`}>
                                <Icon className={`w-3.5 h-3.5 ${idx === MOCK_JOURNEY.length - 1 ? 'text-white' : 'text-emerald-500'}`} />
                             </div>
                             
                             <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                   <h3 className="font-bold text-slate-800 text-lg">{event.title}</h3>
                                   {event.tag && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">{event.tag}</span>}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mb-3 bg-slate-50 inline-flex px-2 py-1 rounded-md">
                                   <Calendar className="w-3.5 h-3.5"/>
                                   {event.time}
                                </div>
                                <p className="text-slate-600 text-sm leading-relaxed mb-4">{event.desc}</p>
                                
                                {event.image && (
                                   <div className="mb-4 rounded-xl overflow-hidden shadow-sm h-32 relative group-hover:shadow-md transition-shadow">
                                      <img src={event.image} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                   </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs">
                                   <div className="flex flex-col gap-1">
                                      <span className="text-slate-400 font-medium">地点/经纬度</span>
                                      <span className="text-slate-700 font-bold truncate flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400"/> {event.location}</span>
                                   </div>
                                   <div className="flex flex-col gap-1 pl-3 border-l border-slate-100">
                                      <span className="text-slate-400 font-medium">执行人/机构</span>
                                      <span className="text-slate-700 font-bold truncate">{event.actor}</span>
                                   </div>
                                </div>
                                
                                {(event.weather || event.data || event.temp) && (
                                   <div className="mt-3 bg-blue-50/50 rounded-lg p-3 border border-blue-100/50 text-xs text-slate-600 flex items-start gap-2">
                                      <div className="mt-0.5"><ShieldCheck className="w-3.5 h-3.5 text-blue-400" /></div>
                                      <div className="font-medium text-blue-800/80">
                                         环境数据抓取: {event.weather || event.data || event.temp}
                                      </div>
                                   </div>
                                )}
                             </div>
                          </div>
                       );
                    })}
                 </div>
              </motion.div>
            )}

            {/* Certificate Tab */}
            {activeTab === 'cert' && (
              <motion.div 
                 key="cert"
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0 }}
                 className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden"
              >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-0"></div>
                 <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 relative z-10"><ShieldCheck className="w-5 h-5 text-emerald-500" /> 品质检验证书</h2>
                 
                 <div className="space-y-4 relative z-10">
                    <div className="flex justify-between py-3 border-b border-slate-100">
                       <span className="text-slate-500 text-sm">发证机构</span>
                       <span className="text-slate-800 font-bold text-sm">大理州农产品质量安全检测中心</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-100">
                       <span className="text-slate-500 text-sm">检测日期</span>
                       <span className="text-slate-800 font-bold text-sm font-mono">2026-05-09</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-100">
                       <span className="text-slate-500 text-sm">农残检测</span>
                       <span className="text-emerald-600 font-bold text-sm flex items-center gap-1">ND (未检出) <CheckCircle className="w-4 h-4"/></span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-100">
                       <span className="text-slate-500 text-sm">重金属指标</span>
                       <span className="text-emerald-600 font-bold text-sm flex items-center gap-1">合格 <CheckCircle className="w-4 h-4"/></span>
                    </div>
                    <div className="flex justify-between py-3">
                       <span className="text-slate-500 text-sm">品级评定</span>
                       <span className="text-amber-600 font-black text-sm bg-amber-50 px-2 py-0.5 rounded border border-amber-200">特级/A级</span>
                    </div>
                 </div>

                 <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <img src="https://api.dicebear.com/7.x/shapes/svg?seed=cert&backgroundColor=ffffff" alt="Seal" className="w-24 h-24 mx-auto opacity-30 mix-blend-multiply" />
                    <div className="text-center text-xs text-slate-400 font-mono mt-2 uppercase tracking-widest">Official Seal of Approval</div>
                 </div>
              </motion.div>
            )}

            {/* Data Tab */}
            {activeTab === 'data' && (
              <motion.div 
                 key="data"
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0 }}
                 className="space-y-4"
              >
                 <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                       <Map className="w-4 h-4 text-emerald-500" /> 生长环境数据
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="text-xs text-slate-500 mb-1">平均光照</div>
                          <div className="text-lg font-black text-amber-500">2200 <span className="text-xs font-medium text-slate-400">hrs</span></div>
                       </div>
                       <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="text-xs text-slate-500 mb-1">平均温度</div>
                          <div className="text-lg font-black text-red-500">18.5 <span className="text-xs font-medium text-slate-400">°C</span></div>
                       </div>
                       <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="text-xs text-slate-500 mb-1">海拔高度</div>
                          <div className="text-lg font-black text-emerald-600">1980 <span className="text-xs font-medium text-slate-400">m</span></div>
                       </div>
                       <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="text-xs text-slate-500 mb-1">土壤类型</div>
                          <div className="text-sm font-black text-purple-600 pt-1">高山微酸红壤</div>
                       </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-4 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                       <span className="font-bold text-slate-700">苍山雪，洱海月：</span> 优越的高原季风气候，极大的昼夜温差与充足紫外线，孕育了芍药花苞大、花杆粗、色彩艳丽的绝佳品质。
                    </p>
                 </div>
              </motion.div>
            )}
         </AnimatePresence>

         <footer className="mt-12 text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold pb-8">
            <p>Powered by AgriTrace Blockchain</p>
            <p className="mt-1 font-mono">Verified. Secure. Transparent.</p>
         </footer>
      </div>
    </div>
  );
}
