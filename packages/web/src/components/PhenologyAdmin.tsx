import { useState } from 'react';
import { Sprout, Plus, Trash2, Loader2, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { listPhenologies, createPhenology, deletePhenology } from '../api/phenology';
import type { CreateCropPhenologyDto, CropPhenologyItem } from '@nongchang/shared';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 标准物候模型管理:按作物维护各生长阶段的预设累计天数,作为批次偏离预警的基准。
export default function PhenologyAdmin() {
  const { data, loading, error, reload } = useApi(listPhenologies);
  const items: CropPhenologyItem[] = data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ cropName: '', stage: '', expectedDays: 30, sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  // 按作物分组展示。
  const grouped = items.reduce<Record<string, CropPhenologyItem[]>>((acc, it) => {
    (acc[it.cropName] ??= []).push(it);
    return acc;
  }, {});

  async function handleCreate() {
    if (!form.cropName.trim() || !form.stage.trim()) {
      setFormErr('请填写作物名称与阶段');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      const dto: CreateCropPhenologyDto = {
        cropName: form.cropName.trim(),
        stage: form.stage.trim(),
        expectedDays: Number(form.expectedDays),
        sortOrder: Number(form.sortOrder),
      };
      await createPhenology(dto);
      setShowModal(false);
      setForm({ cropName: '', stage: '', expectedDays: 30, sortOrder: 0 });
      showToast('已新增物候阶段');
      void reload();
    } catch (e) {
      setFormErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePhenology(id);
      showToast('已删除');
      void reload();
    } catch (e) {
      showToast(errMsg(e));
    }
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
      <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-600" />
            标准物候模型
          </h3>
          <p className="text-xs text-slate-500 mt-1">维护各作物生长阶段的预设累计天数,作为批次生长周期偏离预警的基准</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm">
          <Plus className="w-4 h-4" /> 新增阶段
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-6">
        {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
        {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center text-slate-400 py-16">
            <Sprout className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">尚未配置任何标准物候模型</p>
          </div>
        )}
        {Object.entries(grouped).map(([crop, stages]) => {
          const total = stages.reduce((s, x) => s + x.expectedDays, 0);
          return (
            <div key={crop} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                <span className="font-bold text-emerald-800 flex items-center gap-2">
                  <Sprout className="w-4 h-4" /> {crop}
                </span>
                <span className="text-xs text-emerald-700 font-medium">标准全周期 {total} 天 · {stages.length} 个阶段</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">排序</th>
                    <th className="px-4 py-2 font-medium">阶段</th>
                    <th className="px-4 py-2 font-medium">预设天数</th>
                    <th className="px-4 py-2 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stages].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-400 font-mono">{s.sortOrder}</td>
                      <td className="px-4 py-2 font-medium text-slate-700">{s.stage}</td>
                      <td className="px-4 py-2 text-slate-600">{s.expectedDays} 天</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => void handleDelete(s.id)} className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-700 text-xs font-medium">
                          <Trash2 className="w-3.5 h-3.5" /> 删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Sprout className="w-5 h-5 text-emerald-600" /> 新增物候阶段
              </h3>
              <button onClick={() => setShowModal(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">作物名称</label>
                <input value={form.cropName} onChange={(e) => setForm({ ...form, cropName: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例如:芍药" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">生长阶段</label>
                <input value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例如:萌芽期" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">预设天数</label>
                  <input type="number" min={0} value={form.expectedDays} onChange={(e) => setForm({ ...form, expectedDays: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">排序</label>
                  <input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              {formErr && <p className="text-sm text-red-600">{formErr}</p>}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">取消</button>
              <button onClick={() => void handleCreate()} disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors inline-flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} 保存
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-medium z-50">{toast}</div>
      )}
    </div>
  );
}
