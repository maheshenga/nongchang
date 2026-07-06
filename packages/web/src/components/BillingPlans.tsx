import { useCallback, useState } from 'react';
import { Package, Plus, Loader2, Trash2, Pencil, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { listCreditPlans, createCreditPlan, updateCreditPlan, removeCreditPlan } from '../api/billing';
import type { CreditPlanView, CreditResource, CreateCreditPlanInput } from '@nongchang/shared';
import { MANAGEMENT_PAGE_SIZE, normalizePage, PaginationControls } from '../ui/pagination';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

type Form = { name: string; resource: CreditResource; quantity: number; priceCents: number; isUnit: boolean; active: boolean };
const EMPTY: Form = { name: '', resource: 'AI', quantity: 100, priceCents: 1000, isUnit: false, active: true };

// 套餐管理(仅 SYSTEM_ADMIN):固定套餐 + 单价基准(isUnit)的增删改。
export default function BillingPlans() {
  const [page, setPage] = useState(1);
  const fetchPlans = useCallback(() => listCreditPlans({ page, pageSize: MANAGEMENT_PAGE_SIZE }), [page]);
  const plansApi = useApi(fetchPlans);
  const planPage = normalizePage<CreditPlanView>(plansApi.data, page);
  const plans = planPage.items;

  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const [editing, setEditing] = useState<CreditPlanView | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function openCreate() { setEditing(null); setForm(EMPTY); setErr(''); setShowForm(true); }
  function openEdit(p: CreditPlanView) {
    setEditing(p);
    setForm({ name: p.name, resource: p.resource, quantity: p.quantity, priceCents: p.priceCents, isUnit: p.isUnit, active: p.active });
    setErr(''); setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { setErr('请输入套餐名称'); return; }
    if (form.quantity < 1) { setErr('数量必须 ≥ 1'); return; }
    if (form.priceCents < 0) { setErr('价格不能为负'); return; }
    setSaving(true); setErr('');
    try {
      const dto: CreateCreditPlanInput = {
        name: form.name.trim(), resource: form.resource, quantity: Number(form.quantity),
        priceCents: Number(form.priceCents), isUnit: form.isUnit, active: form.active,
      };
      if (editing) await updateCreditPlan(editing.id, dto);
      else await createCreditPlan(dto);
      setShowForm(false);
      showToast(editing ? '套餐已更新' : '套餐已创建');
      void plansApi.reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: CreditPlanView) {
    if (!confirm(`确认删除套餐「${p.name}」?若已有订单引用则会改为下架。`)) return;
    try {
      await removeCreditPlan(p.id);
      showToast('已删除');
      void plansApi.reload();
    } catch (e) {
      showToast(errMsg(e));
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 flex items-center justify-between">
        <span className="flex items-center gap-2"><Package className="w-4 h-4 text-emerald-600" /> 套餐管理</span>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm">
          <Plus className="w-4 h-4" /> 新增套餐
        </button>
      </div>

      <div className="p-4">
        {plansApi.loading && <div className="text-center text-slate-400 text-sm py-6 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 加载中…</div>}
        {plansApi.error && <div className="p-4 text-center text-rose-500 text-sm">{plansApi.error}</div>}
        {!plansApi.loading && plans.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">暂无套餐</p>}
        {plans.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">资源</th>
                <th className="px-3 py-2 font-medium text-right">数量</th>
                <th className="px-3 py-2 font-medium text-right">价格</th>
                <th className="px-3 py-2 font-medium text-center">类型</th>
                <th className="px-3 py-2 font-medium text-center">状态</th>
                <th className="px-3 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">{p.name}</td>
                  <td className="px-3 py-2 text-slate-600">{p.resource === 'AI' ? 'AI算力' : '二维码'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{p.quantity.toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{yuan(p.priceCents)}</td>
                  <td className="px-3 py-2 text-center text-xs">{p.isUnit ? <span className="text-indigo-600">单价基准</span> : '固定套餐'}</td>
                  <td className="px-3 py-2 text-center text-xs">{p.active ? <span className="text-emerald-600">上架</span> : <span className="text-slate-400">下架</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-700 text-xs font-medium mr-3"><Pencil className="w-3.5 h-3.5" /> 编辑</button>
                    <button onClick={() => void remove(p)} className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-600 text-xs font-medium"><Trash2 className="w-3.5 h-3.5" /> 删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!plansApi.error && (
          <PaginationControls
            page={planPage.page}
            pageSize={planPage.pageSize}
            total={planPage.total}
            loading={plansApi.loading}
            onPageChange={setPage}
            className="mt-4 rounded-lg border"
          />
        )}
      </div>

      {showForm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-emerald-600" /> {editing ? '编辑套餐' : '新增套餐'}</h3>
              <button onClick={() => setShowForm(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">套餐名称</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="如:AI 算力 100 次" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">资源类型</label>
                  <select value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value as CreditResource })} className={inputCls}>
                    <option value="AI">AI算力</option>
                    <option value="CODE">二维码</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">数量</label>
                  <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">价格(元)</label>
                <input type="number" min={0} step="0.01" value={(form.priceCents / 100).toString()} onChange={(e) => setForm({ ...form, priceCents: Math.round(Number(e.target.value) * 100) })} className={inputCls} />
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.isUnit} onChange={(e) => setForm({ ...form, isUnit: e.target.checked })} className="rounded" />
                  单价基准(供自定义数量计价)
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                  上架
                </label>
              </div>
              {form.isUnit && <p className="text-xs text-slate-400">单价基准:单价 = 价格 ÷ 数量。自定义购买时按此单价乘以购买量计费。建议数量填 1。</p>}
              {err && <p className="text-sm text-red-600">{err}</p>}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors">取消</button>
              <button onClick={() => void save()} disabled={saving} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors inline-flex items-center gap-2">
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
