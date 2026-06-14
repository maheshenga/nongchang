import { useState } from 'react';
import { LayoutTemplate, RefreshCw, Plus, Trash2, X } from 'lucide-react';
import type { QuickTemplateView, QuickTemplateInput } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listQuickTemplates, createQuickTemplate, updateQuickTemplate, deleteQuickTemplate } from '../api/quick-template';

interface EditState {
  id: string | null;
  name: string;
  action: string;
  note: string;
  cost: string;
  labor: string;
  sort: string;
}

const EMPTY: EditState = { id: null, name: '', action: '', note: '', cost: '', labor: '', sort: '' };

const inputCls =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition';

export default function QuickTemplates() {
  const { data, loading, error, reload } = useApi(listQuickTemplates);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const templates = data ?? [];

  const openCreate = () => { setErr(null); setEdit({ ...EMPTY }); };
  const openEdit = (t: QuickTemplateView) => {
    setErr(null);
    setEdit({
      id: t.id, name: t.name, action: t.action, note: t.note ?? '',
      cost: t.cost != null ? String(t.cost) : '',
      labor: t.labor != null ? String(t.labor) : '',
      sort: String(t.sort),
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setSubmitting(true); setErr(null);
    const dto: QuickTemplateInput = {
      name: edit.name.trim(),
      action: edit.action.trim(),
      ...(edit.note.trim() ? { note: edit.note.trim() } : {}),
      ...(edit.cost !== '' ? { cost: Number(edit.cost) } : {}),
      ...(edit.labor !== '' ? { labor: Number(edit.labor) } : {}),
      ...(edit.sort !== '' ? { sort: Number(edit.sort) } : {}),
    };
    try {
      if (edit.id) await updateQuickTemplate(edit.id, dto);
      else await createQuickTemplate(dto);
      setEdit(null);
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally { setSubmitting(false); }
  };

  const onDelete = async (t: QuickTemplateView) => {
    if (!window.confirm(`确认删除模板「${t.name}」?`)) return;
    try {
      await deleteQuickTemplate(t.id);
      await reload();
    } catch (e2) {
      window.alert(e2 instanceof Error ? e2.message : '删除失败');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg"><LayoutTemplate className="w-4 h-4" /></div>
          <h2 className="font-bold text-base">快捷模板</h2>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> 新建模板
        </button>
      </div>
      <p className="text-xs text-slate-500 -mt-3">模板为租户共享。农户在小程序「记一笔」点击模板可一键回填农事动作、备注、成本、工时。</p>

      {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
      {error && (
        <div className="p-8 text-center text-rose-500 text-sm">
          加载失败:{error}
          <button onClick={() => void reload()} className="underline font-bold ml-2 inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> 重试
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {templates.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">暂无模板</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">名称</th>
                  <th className="text-left px-5 py-3 font-bold">农事动作</th>
                  <th className="text-left px-5 py-3 font-bold">备注</th>
                  <th className="text-left px-5 py-3 font-bold">成本/工时</th>
                  <th className="text-right px-5 py-3 font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-bold text-slate-700">{t.name}</td>
                    <td className="px-5 py-3 text-slate-600">{t.action}</td>
                    <td className="px-5 py-3 text-slate-500 max-w-[12rem] truncate">{t.note || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{t.cost != null ? `¥${t.cost}` : '—'} / {t.labor != null ? `${t.labor}天` : '—'}</td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button onClick={() => openEdit(t)} className="text-emerald-600 hover:text-emerald-700 font-bold">编辑</button>
                      <button onClick={() => void onDelete(t)} className="text-rose-500 hover:text-rose-600 font-bold inline-flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{edit.id ? '编辑模板' : '新建模板'}</h3>
              <button onClick={() => setEdit(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => void onSubmit(e)} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">名称</label>
                <input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="如:浇水" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">农事动作</label>
                <input className={inputCls} value={edit.action} onChange={(e) => setEdit({ ...edit, action: e.target.value })} placeholder="如:浇水" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">预设备注(可选)</label>
                <textarea className={inputCls} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="如:滴灌 30 分钟" rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">成本(元)</label>
                  <input className={inputCls} type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} placeholder="可选" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">工时(天)</label>
                  <input className={inputCls} type="number" value={edit.labor} onChange={(e) => setEdit({ ...edit, labor: e.target.value })} placeholder="可选" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">排序</label>
                  <input className={inputCls} type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: e.target.value })} placeholder="0" />
                </div>
              </div>
              {err && <div className="text-sm text-rose-500 font-bold">{err}</div>}
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
                  {submitting ? '保存中…' : '保存'}
                </button>
                <button type="button" onClick={() => setEdit(null)} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2 rounded-lg text-sm font-bold transition-colors">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
