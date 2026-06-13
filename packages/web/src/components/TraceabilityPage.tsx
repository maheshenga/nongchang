import { useState, useEffect } from 'react';
import { ShieldCheck, MapPin, Calendar, Sprout, Truck, Store, Leaf, ArrowLeft, Hexagon, Sun, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchPublicTrace, TraceNotFoundError } from '../api/trace';
import type { PublicTraceResult, TraceEventType } from '@nongchang/shared';

const ICON_BY_TYPE: Record<TraceEventType, typeof Sprout> = {
  origin: Sprout, farm: Leaf, harvest: Sun, warehouse: Hexagon, logistics: Truck, retail: Store,
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function TraceabilityPage({ code, onBack }: { code: string, onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState<'journey' | 'cert'>('journey');
  const [data, setData] = useState<PublicTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetchPublicTrace(code)
      .then((res) => { if (alive) setData(res); })
      .catch((e) => { if (alive) setError(e instanceof TraceNotFoundError ? e.message : '溯源查询失败,请稍后重试'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600">
        <div className="relative w-12 h-12 mb-4">
          <div className="absolute inset-0 border-4 border-emerald-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
          <Hexagon className="absolute inset-0 m-auto text-emerald-500 w-5 h-5 opacity-50" />
        </div>
        <p className="text-sm tracking-widest font-bold text-slate-700">正在验证溯源档案…</p>
        <p className="text-xs text-slate-400 mt-1 font-mono">Verifying block integrity & signatures</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 px-6 text-center">
        <ShieldCheck className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-lg font-bold text-slate-800 mb-1">溯源码无效或不存在</h2>
        <p className="text-sm text-slate-500 mb-6 break-all">{error ?? `未找到溯源码 ${code}`}</p>
        {onBack && (
          <button onClick={onBack} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-sm font-medium transition-colors">返回</button>
        )}
      </div>
    );
  }

  if (data.frozen) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 px-6 text-center">
        <ShieldCheck className="w-12 h-12 text-red-300 mb-4" />
        <h2 className="text-lg font-bold text-slate-800 mb-1">该溯源码已被冻结</h2>
        <p className="text-sm text-slate-500 mb-6 break-all">此溯源码 {code} 因疑似异常已被冻结，请谨慎辨别商品真伪。</p>
        {onBack && (
          <button onClick={onBack} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-sm font-medium transition-colors">返回</button>
        )}
      </div>
    );
  }

  const { batch, events, scanCount } = data;
  const origin = batch.region ?? batch.fieldName;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-900 pb-12">
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
            ) : (<div className="w-9 h-9"></div>)}
            <div className="font-bold tracking-widest text-emerald-100 text-sm flex items-center gap-1.5"><ShieldCheck className="w-4 h-4"/> 官方溯源档案</div>
            <div className="w-9 h-9"></div>
          </div>

          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 bg-emerald-400/20 border border-emerald-400/30 rounded-full text-emerald-200 text-xs font-bold font-mono mb-4 backdrop-blur-sm shadow-inner">
              {code}
            </span>
            <h1 className="text-3xl font-black mb-2 tracking-tight">{batch.cropName}</h1>
            <div className="flex items-center justify-center gap-4 text-emerald-100/80 text-sm font-medium">
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/> {origin}</span>
              <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/> 批次 {batch.batchNo}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-2xl relative overflow-hidden text-center mt-8 -mb-20 transform translate-y-12 ring-4 ring-white/10">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">正品认证通过</h2>
              <p className="text-sm text-slate-500 mb-4 px-4 line-clamp-2">此溯源码信息真实有效,记录全程可追溯。感谢您选择高品质原产地鲜花。</p>
              <div className="w-full bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-left">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">累计扫码</div>
                  <div className="text-xs font-mono font-medium text-slate-700">{scanCount} 次</div>
                </div>
                <div className="pl-2 border-l border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">溯源码</div>
                  <div className="text-xs font-mono font-medium text-emerald-600 truncate">{code}</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto pt-28 px-5">
        <div className="flex bg-white rounded-full p-1 shadow-sm mb-8 sticky top-4 z-20 border border-slate-200">
          {[{id: 'journey', label: '生命旅程'}, {id: 'cert', label: '防伪验证'}].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as 'journey' | 'cert')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-full transition-all ${activeTab === t.id ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'journey' && (
            <motion.div key="journey" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="relative pl-8 before:absolute before:inset-0 before:ml-[1.18rem] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-emerald-200 before:via-emerald-400/50 before:to-emerald-200/20">
                {events.map((ev, idx) => {
                  const Icon = ICON_BY_TYPE[ev.type];
                  const p = (ev.payload ?? {}) as Record<string, unknown>;
                  const desc = typeof p.desc === 'string' ? p.desc : undefined;
                  const image = typeof p.image === 'string' ? p.image : undefined;
                  const tag = typeof p.tag === 'string' ? p.tag : undefined;
                  const env = [p.weather, p.data, p.temp].find((v) => typeof v === 'string') as string | undefined;
                  const isLast = idx === events.length - 1;
                  return (
                    <div key={idx} className="relative mb-10 last:mb-0 group">
                      <div className={`absolute left-[-2.05rem] w-8 h-8 rounded-full border-4 border-slate-50 flex items-center justify-center shrink-0 z-10 shadow-sm transition-transform duration-300 group-hover:scale-110 ${isLast ? 'bg-emerald-500' : 'bg-white'}`}>
                        <Icon className={`w-3.5 h-3.5 ${isLast ? 'text-white' : 'text-emerald-500'}`} />
                      </div>
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-slate-800 text-lg">{ev.title}</h3>
                          {tag && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">{tag}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mb-3 bg-slate-50 inline-flex px-2 py-1 rounded-md">
                          <Calendar className="w-3.5 h-3.5"/>
                          {fmtTime(ev.occurredAt)}
                        </div>
                        {desc && <p className="text-slate-600 text-sm leading-relaxed mb-4">{desc}</p>}
                        {image && (
                          <div className="mb-4 rounded-xl overflow-hidden shadow-sm h-32 relative group-hover:shadow-md transition-shadow">
                            <img src={image} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-400 font-medium">地点</span>
                            <span className="text-slate-700 font-bold truncate flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400"/> {ev.location}</span>
                          </div>
                          <div className="flex flex-col gap-1 pl-3 border-l border-slate-100">
                            <span className="text-slate-400 font-medium">执行人/机构</span>
                            <span className="text-slate-700 font-bold truncate">{ev.actor}</span>
                          </div>
                        </div>
                        {env && (
                          <div className="mt-3 bg-blue-50/50 rounded-lg p-3 border border-blue-100/50 text-xs text-slate-600 flex items-start gap-2">
                            <div className="mt-0.5"><ShieldCheck className="w-3.5 h-3.5 text-blue-400" /></div>
                            <div className="font-medium text-blue-800/80">环境数据抓取: {env}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'cert' && (
            <motion.div key="cert" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-0"></div>
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 relative z-10"><ShieldCheck className="w-5 h-5 text-emerald-500" /> 防伪验证</h2>
              <div className="space-y-4 relative z-10">
                <div className="flex justify-between py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">溯源码</span>
                  <span className="text-slate-800 font-bold text-sm font-mono">{code}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">累计扫码次数</span>
                  <span className="text-slate-800 font-bold text-sm font-mono">{scanCount}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">产地</span>
                  <span className="text-slate-800 font-bold text-sm">{origin}</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-slate-500 text-sm">验证状态</span>
                  <span className="text-emerald-600 font-bold text-sm flex items-center gap-1">真实有效 <CheckCircle className="w-4 h-4"/></span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-12 text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold pb-8">
          <p>Powered by AgriTrace</p>
          <p className="mt-1 font-mono">Verified. Secure. Transparent.</p>
        </footer>
      </div>
    </div>
  );
}
