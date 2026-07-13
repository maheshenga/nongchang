import { useCallback, useState } from 'react';
import { Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { confirmDialog } from '../hooks/useDialog';
import { createCreditPlan, listCreditPlans, removeCreditPlan, updateCreditPlan } from '../api/billing';
import type { CreateCreditPlanInput, CreditPlanView, CreditResource } from '@nongchang/shared';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { MANAGEMENT_PAGE_SIZE, normalizePage, PaginationControls } from '../ui/pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type PlanForm = {
  name: string;
  resource: CreditResource;
  quantity: number;
  priceCents: number;
  isUnit: boolean;
  active: boolean;
};

const EMPTY_FORM: PlanForm = {
  name: '',
  resource: 'AI',
  quantity: 100,
  priceCents: 1000,
  isUnit: false,
  active: true,
};

const RESOURCE_LABEL: Record<CreditResource, string> = { AI: 'AI算力', CODE: '二维码' };

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default function BillingPlans() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(MANAGEMENT_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  const fetchPlans = useCallback(() => listCreditPlans({ page, pageSize, ...(debouncedSearch ? { search: debouncedSearch } : {}) }), [debouncedSearch, page, pageSize]);
  const plansApi = useApi(fetchPlans, { cacheKey: `billing-plans-${page}-${pageSize}-${debouncedSearch}` });
  const planPage = normalizePage<CreditPlanView>(plansApi.data, page, pageSize);
  const plans = planPage.items;

  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState<CreditPlanView | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr('');
    setShowForm(true);
  }

  function openEdit(plan: CreditPlanView) {
    setEditing(plan);
    setForm({
      name: plan.name,
      resource: plan.resource,
      quantity: plan.quantity,
      priceCents: plan.priceCents,
      isUnit: plan.isUnit,
      active: plan.active,
    });
    setErr('');
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setErr('请输入套餐名称');
      return;
    }
    if (form.quantity < 1) {
      setErr('数量必须大于 0');
      return;
    }
    if (form.priceCents < 0) {
      setErr('价格不能为负');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const dto: CreateCreditPlanInput = {
        name: form.name.trim(),
        resource: form.resource,
        quantity: Number(form.quantity),
        priceCents: Number(form.priceCents),
        isUnit: form.isUnit,
        active: form.active,
      };
      if (editing) await updateCreditPlan(editing.id, dto);
      else await createCreditPlan(dto);
      setShowForm(false);
      showToast(editing ? '套餐已更新' : '套餐已创建');
      void plansApi.reload();
    } catch (error) {
      setErr(errMsg(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(plan: CreditPlanView) {
    const confirmed = await confirmDialog({
      title: '删除套餐',
      message: `确认删除套餐「${plan.name}」？如果已有订单引用，后端会改为下架。`,
      confirmLabel: '删除',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await removeCreditPlan(plan.id);
      showToast('套餐已删除');
      void plansApi.reload();
    } catch (error) {
      showToast(errMsg(error));
    }
  }

  return (
    <div className="relative overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
          <Package className="h-4 w-4 text-[#0078D4]" />
          套餐管理
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
            <input
              type="search"
              placeholder="搜索套餐名称"
              value={searchQuery}
              onChange={event => { setSearchQuery(event.target.value); setPage(1); }}
              className={`${fluentInput} w-full pl-8`}
            />
          </div>
          <button type="button" onClick={openCreate} className={fluentButton('primary')}>
            <Plus className="h-4 w-4" /> 新增套餐
          </button>
        </div>
      </div>

      <div className="p-4">
        {plansApi.loading && <LoadingState label="加载套餐" />}
        {plansApi.error && <ErrorState message={plansApi.error} onRetry={() => void plansApi.reload()} />}
        {!plansApi.loading && !plansApi.error && plans.length === 0 && (
          <EmptyState title="暂无套餐" description="新增套餐后，购买方可在额度购买页选择固定套餐或自定义数量。" />
        )}

        {plans.length > 0 && (
          <div className={`${fluentTable.wrapper} overflow-x-auto`}>
            <table className={`${fluentTable.table} min-w-[760px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>名称</th>
                  <th className={fluentTable.th}>资源</th>
                  <th className={`${fluentTable.th} text-right`}>数量</th>
                  <th className={`${fluentTable.th} text-right`}>价格</th>
                  <th className={`${fluentTable.th} text-center`}>类型</th>
                  <th className={`${fluentTable.th} text-center`}>状态</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className={fluentTable.row}>
                    <td className={`${fluentTable.td} font-semibold`}>{plan.name}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{RESOURCE_LABEL[plan.resource]}</td>
                    <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>
                      {plan.quantity.toLocaleString('zh-CN')}
                    </td>
                    <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>{yuan(plan.priceCents)}</td>
                    <td className={`${fluentTable.td} text-center`}>
                      <span className={fluentStatusTag(plan.isUnit ? 'active' : 'neutral')}>
                        {plan.isUnit ? '单价基准' : '固定套餐'}
                      </span>
                    </td>
                    <td className={`${fluentTable.td} text-center`}>
                      <span className={fluentStatusTag(plan.active ? 'success' : 'neutral')}>
                        {plan.active ? '上架' : '下架'}
                      </span>
                    </td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex items-center gap-2">
                        <button type="button" onClick={() => openEdit(plan)} className={fluentButton('subtle')}>
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button type="button" onClick={() => void remove(plan)} className={fluentButton('danger')}>
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!plansApi.error && (
          <PaginationControls
            page={planPage.page}
            pageSize={planPage.pageSize}
            total={planPage.total}
            loading={plansApi.loading}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            className={plans.length > 0 ? '' : 'mt-4 border border-[#E1DFDD]'}
          />
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label={editing ? '编辑套餐' : '新增套餐'}>
          <div className="w-full max-w-md overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5">
              <h3 className="flex items-center gap-2 text-base font-semibold text-[#242424]">
                <Package className="h-5 w-5 text-[#0078D4]" />
                {editing ? '编辑套餐' : '新增套餐'}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label htmlFor="billing-plan-name" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                套餐名称
                <input
                  id="billing-plan-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className={`${fluentInput} w-full`}
                  placeholder="如：AI 算力 100 次"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label htmlFor="billing-plan-resource" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                  资源类型
                  <select
                    id="billing-plan-resource"
                    value={form.resource}
                    onChange={(event) => setForm({ ...form, resource: event.target.value as CreditResource })}
                    className={`${fluentSelect} w-full`}
                  >
                    <option value="AI">AI算力</option>
                    <option value="CODE">二维码</option>
                  </select>
                </label>

                <label htmlFor="billing-plan-quantity" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                  数量
                  <input
                    id="billing-plan-quantity"
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
                    className={`${fluentInput} w-full`}
                  />
                </label>
              </div>

              <label htmlFor="billing-plan-price" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                价格（元）
                <input
                  id="billing-plan-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={(form.priceCents / 100).toString()}
                  onChange={(event) => setForm({ ...form, priceCents: Math.round(Number(event.target.value) * 100) })}
                  className={`${fluentInput} w-full`}
                />
              </label>

              <div className="grid gap-2 text-sm text-[#242424]">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isUnit}
                    onChange={(event) => setForm({ ...form, isUnit: event.target.checked })}
                    className="h-4 w-4 rounded border-[#C8C6C4] text-[#0078D4] focus:ring-[#0078D4]/40"
                  />
                  单价基准（供自定义数量计价）
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm({ ...form, active: event.target.checked })}
                    className="h-4 w-4 rounded border-[#C8C6C4] text-[#0078D4] focus:ring-[#0078D4]/40"
                  />
                  上架
                </label>
              </div>

              {form.isUnit && (
                <p className="text-xs leading-5 text-[#605E5C]">
                  单价基准用于自定义数量购买：单价 = 价格除以数量。建议数量填 1。
                </p>
              )}

              {err && <ErrorState message={err} retryLabel="关闭" onRetry={() => setErr('')} />}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={() => setShowForm(false)} className={fluentButton('secondary')}>
                取消
              </button>
              <button type="button" onClick={() => void save()} disabled={saving} className={fluentButton('primary')}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 border border-[#E1DFDD] bg-[#242424] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
