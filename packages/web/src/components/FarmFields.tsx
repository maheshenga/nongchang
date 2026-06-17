import { useState } from 'react';
import { Map, MapPin, Search, Plus, Layers, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../hooks/useApi';
import { listFields, createField, type Field } from '../api/fields';
import TiandituMap from './TiandituMap';
import TiandituPicker from './TiandituPicker';
import { listMerchants, type MerchantUser } from '../api/agents';
import { useAuth } from '../auth/auth-context';
import type { CreateFieldDto, AuthUser } from '@nongchang/shared';

export default function FarmFields() {
  const { user } = useAuth();
  const { data: rawFields, loading, error, reload } = useApi(listFields);
  const fields: Field[] = rawFields ?? [];
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const activeField = fields.find((f) => f.id === activeFieldId) ?? fields[0] ?? null;
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filteredFields = fields.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col space-y-4">
      {showCreate && (
        <CreateFieldModal
          user={user}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void reload(); }}
        />
      )}
      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && (
        <div className="p-8 text-center text-rose-500 text-sm">
          {error}
          <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button>
        </div>
      )}
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Map className="w-6 h-6 text-emerald-600" />
            数字地块管理
          </h2>
          <p className="text-sm text-slate-500 mt-1">管理种植基地边界、传感器网络及实时环境数据</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 flex items-center rounded-lg max-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
            <input 
              type="text" 
              placeholder="搜索地块..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm px-2 w-full text-slate-700" 
            />
          </div>
          <button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> 绘制新地块
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left List */}
        <div className="w-80 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm">地块列表 ({filteredFields.length})</h3>
            <div className="flex bg-white rounded border border-slate-200 p-0.5">
               <button onClick={() => setViewMode('map')} className={`p-1 rounded ${viewMode === 'map' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}><MapPin className="w-3.5 h-3.5" /></button>
               <button onClick={() => setViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}><Layers className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredFields.map(field => (
              <button
                key={field.id}
                onClick={() => setActiveFieldId(field.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${activeField?.id === field.id ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50 border-slate-100'}`}
              >
                 <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-sm text-slate-800">{field.name}</span>
                 </div>
                 <div className="text-xs text-slate-500 mt-1">归属商户: <span className="font-bold text-slate-700">{field.ownerName ?? '—'}</span></div>
                 <div className="text-xs text-slate-500 flex items-center gap-2 mt-2">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{field.area} 亩</span>
                 </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Map/Detail Area */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative flex flex-col">
          {viewMode === 'map' ? (
            <div className="flex-1 relative bg-slate-100">
               <TiandituMap
                 fields={fields}
                 activeFieldId={activeField?.id ?? null}
                 onSelect={setActiveFieldId}
               />
               {/* Overlay Stats for Active Field */}
               <AnimatePresence mode="wait">
                 <motion.div
                   key={activeField?.id ?? 'none'}
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="absolute top-6 right-6 w-64 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-slate-200 p-4 z-[400]"
                 >
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-black text-slate-800">{activeField?.name ?? '—'}</h4>
                      <div className="p-1.5 bg-slate-100 rounded-md">
                        <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    </div>
                    <ul className="space-y-1.5 border-t border-slate-100 pt-3">
                       <li className="flex justify-between text-xs">
                         <span className="text-slate-500">负责人</span>
                         <span className="font-bold text-slate-700">{activeField?.ownerName ?? '—'}</span>
                       </li>
                       <li className="flex justify-between text-xs">
                         <span className="text-slate-500">规划面积</span>
                         <span className="font-mono text-slate-700">{activeField?.area ?? '—'} 亩</span>
                       </li>
                       <li className="flex justify-between text-xs">
                         <span className="text-slate-500">经纬度</span>
                         <span className="font-mono text-slate-700">
                           {activeField?.lng != null && activeField?.lat != null
                             ? `${activeField.lng.toFixed(4)}, ${activeField.lat.toFixed(4)}`
                             : '—'}
                         </span>
                       </li>
                       <li className="flex justify-between text-xs">
                         <span className="text-slate-500">IoT 设备</span>
                         <span className="font-bold text-slate-700">{activeField?.iotDeviceId ?? '—'}</span>
                       </li>
                    </ul>
                 </motion.div>
               </AnimatePresence>
             </div>
           ) : (
             <div className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start gap-6">
                     <div className="w-32 h-32 bg-slate-100 rounded-xl flex items-center justify-center border-2 border-slate-200 shrink-0 overflow-hidden relative">
                       <div className="absolute inset-0 bg-emerald-500/10 z-10" />
                       <MapPin className="w-8 h-8 text-emerald-600 opacity-50 absolute" />
                     </div>
                     <div className="flex-1">
                       <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-2xl font-black text-slate-800">{activeField?.name ?? '—'}</h3>
                       </div>
                       <p className="text-sm text-slate-500 mb-4 bg-slate-50 inline-block px-3 py-1.5 rounded-lg border border-slate-100">标识码: {activeField?.id ?? '—'} • 面积: {activeField?.area ?? '—'} 亩</p>
                       <div className="flex gap-3">
                          <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-emerald-700">编辑信息</button>
                       </div>
                     </div>
                  </div>
                </div>
             </div>
           )}
         </div>
       </div>
     </div>
   );
}

function CreateFieldModal({
  user, onClose, onCreated,
}: {
  user: AuthUser | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isMerchant = user?.role === 'merchant';
  const { data: merchants } = useApi(listMerchants);
  const [ownerId, setOwnerId] = useState(isMerchant ? (user?.ownerId ?? user?.userId ?? '') : '');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [lng, setLng] = useState('');
  const [lat, setLat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const dto: CreateFieldDto = {
        ownerId,
        name,
        area: Number(area),
        lng: Number(lng),
        lat: Number(lat),
      };
      await createField(dto);
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-slate-800 text-lg">新建地块</h3>
        {!isMerchant && (
          <label className="block text-xs font-bold text-slate-500">归属商家
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">请选择…</option>
              {((merchants as MerchantUser[] | null) ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}（{m.username}）</option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs font-bold text-slate-500">地块名称
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-500">面积(亩)
          <input type="number" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} required
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div>
          <span className="block text-xs font-bold text-slate-500 mb-1">地块位置(点击地图选点,或手动填写)</span>
          <div className="h-48 rounded-lg overflow-hidden border border-slate-200">
            <TiandituPicker
              lng={lng ? Number(lng) : null}
              lat={lat ? Number(lat) : null}
              onPick={(pLng, pLat) => { setLng(String(pLng)); setLat(String(pLat)); }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold text-slate-500">经度
            <input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} required
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-bold text-slate-500">纬度
            <input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} required
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        {err && <p className="text-rose-500 text-xs">{err}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600">取消</button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
            {submitting ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
