import { useState } from 'react';
import { ShoppingCart, Zap, QrCode, Loader2, Check, Clock, CreditCard, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { listCreditPlans, listOrders, createOrder, createPayment, cancelOrder } from '../api/billing';
import { redirectToAlipayUrl, submitAlipayForm } from '../utils/alipay-form';
import type { CreditPlanView, CreditResource, CreditOrderView } from '@nongchang/shared';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

const RESOURCE_LABEL: Record<CreditResource, string> = { AI: 'AI算力', CODE: '二维码' };

// 简单判断移动端,决定走 WAP(H5)还是 PC 网页支付。
function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 发起支付宝支付:PC 跳转 payUrl;WAP 写入表单 HTML 自动提交。支付完成后支付宝异步回调入账。
function launchAlipay(payUrl: string | null, formHtml: string | null) {
  if (payUrl) {
    redirectToAlipayUrl(payUrl);
    return;
  }
  if (formHtml) {
    submitAlipayForm(formHtml);
    return;
  }
  throw new Error('Invalid Alipay payment payload');
}

// 自助购买额度:套餐选购(固定套餐 + 自定义数量)+ 订单列表(待支付可去支付/取消)。
export default function BillingPurchase({ onPaid }: { onPaid?: () => void }) {
  const plansApi = useApi(listCreditPlans);
  const ordersApi = useApi(() => listOrders({ pageSize: 20 }));
  const plans: CreditPlanView[] = plansApi.data ?? [];
  const orders: CreditOrderView[] = ordersApi.data?.items ?? [];

  // 固定套餐(非单价基准),按资源分组展示。
  const fixedPlans = plans.filter((p) => !p.isUnit && p.active);
  // 单价基准:每资源是否可自定义购买。
  const unitResources = new Set(plans.filter((p) => p.isUnit && p.active).map((p) => p.resource));

  const [busyId, setBusyId] = useState<string>('');
  const [err, setErr] = useState('');

  // 自定义购买表单
  const [customResource, setCustomResource] = useState<CreditResource>('AI');
  const [customQty, setCustomQty] = useState<number>(100);

  async function reload() {
    void plansApi.reload();
    void ordersApi.reload();
    onPaid?.();
  }

  // 下单 → 发起支付宝支付(PC 跳转 / WAP 提交表单)。支付完成由支付宝异步回调入账。
  async function buyPlan(plan: CreditPlanView) {
    setBusyId(`plan-${plan.id}`); setErr('');
    try {
      const order = await createOrder({ planId: plan.id });
      const channel = isMobile() ? 'WAP' : 'PC';
      const pay = await createPayment({ orderId: order.id, channel });
      launchAlipay(pay.payUrl, pay.formHtml);
    } catch (e) {
      setErr(errMsg(e));
      await reload();
    } finally {
      setBusyId('');
    }
  }

  async function buyCustom() {
    if (!customQty || customQty < 1) { setErr('请输入有效数量'); return; }
    setBusyId('custom'); setErr('');
    try {
      const order = await createOrder({ resource: customResource, quantity: Number(customQty) });
      const channel = isMobile() ? 'WAP' : 'PC';
      const pay = await createPayment({ orderId: order.id, channel });
      launchAlipay(pay.payUrl, pay.formHtml);
    } catch (e) {
      setErr(errMsg(e));
      await reload();
    } finally {
      setBusyId('');
    }
  }

  // 对待支付订单重新发起支付宝支付。
  async function pay(orderId: string) {
    setBusyId(`order-${orderId}`); setErr('');
    try {
      const channel = isMobile() ? 'WAP' : 'PC';
      const p = await createPayment({ orderId, channel });
      launchAlipay(p.payUrl, p.formHtml);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusyId('');
    }
  }

  // 取消待支付订单(用户放弃支付时回收 PENDING 订单)。
  async function cancel(orderId: string) {
    setBusyId(`cancel-${orderId}`); setErr('');
    try {
      await cancelOrder(orderId);
      await reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusyId('');
    }
  }

  const inputCls = 'px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-emerald-600" /> 购买额度
      </div>

      <div className="p-5 space-y-6">
        {err && <p className="text-sm text-red-600">{err}</p>}

        {/* 固定套餐 */}
        {plansApi.loading && <div className="text-center text-slate-400 text-sm flex items-center justify-center gap-2 py-6"><Loader2 className="w-4 h-4 animate-spin" /> 加载套餐…</div>}
        {!plansApi.loading && fixedPlans.length === 0 && unitResources.size === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">暂无可购买的套餐,请联系平台管理员配置</p>
        )}

        {fixedPlans.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fixedPlans.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-xl p-4 flex flex-col hover:border-emerald-300 hover:shadow-sm transition">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  {p.resource === 'AI' ? <Zap className="w-4 h-4 text-emerald-600" /> : <QrCode className="w-4 h-4 text-emerald-600" />}
                  {p.name}
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-800 font-mono">{p.quantity.toLocaleString('zh-CN')}<span className="text-sm font-normal text-slate-400 ml-1">{p.resource === 'AI' ? '次' : '个'}</span></div>
                <div className="mt-1 text-lg font-bold text-emerald-600">{yuan(p.priceCents)}</div>
                <button onClick={() => void buyPlan(p)} disabled={busyId === `plan-${p.id}`} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition">
                  {busyId === `plan-${p.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} 购买
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 自定义数量 */}
        {unitResources.size > 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-700 mb-3">自定义数量购买</div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">资源</label>
                <select value={customResource} onChange={(e) => setCustomResource(e.target.value as CreditResource)} className={inputCls}>
                  {unitResources.has('AI') && <option value="AI">AI算力</option>}
                  {unitResources.has('CODE') && <option value="CODE">二维码</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">数量</label>
                <input type="number" min={1} value={customQty} onChange={(e) => setCustomQty(Number(e.target.value))} className={`${inputCls} w-32`} />
              </div>
              <button onClick={() => void buyCustom()} disabled={busyId === 'custom' || !unitResources.has(customResource)} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition">
                {busyId === 'custom' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} 购买
              </button>
            </div>
          </div>
        )}

        {/* 订单列表 */}
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">我的订单</div>
          <p className="text-xs text-slate-400 mb-2">支付完成后额度由支付宝回调自动到账。若支付中断或取消,订单将保持「待支付」,可重新支付或取消。</p>
          {ordersApi.loading && <div className="text-center text-slate-400 text-sm py-4 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 加载中…</div>}
          {!ordersApi.loading && orders.length === 0 && <p className="text-sm text-slate-400 py-4">暂无订单</p>}
          {orders.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2 font-medium">套餐/资源</th>
                  <th className="px-3 py-2 font-medium text-right">数量</th>
                  <th className="px-3 py-2 font-medium text-right">金额</th>
                  <th className="px-3 py-2 font-medium text-center">状态</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{o.planName ?? `${RESOURCE_LABEL[o.resource]}(自定义)`}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{o.quantity.toLocaleString('zh-CN')}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{yuan(o.amountCents)}</td>
                    <td className="px-3 py-2 text-center">
                      {o.status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> 已支付</span>
                      ) : o.status === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> 待支付</span>
                      ) : (
                        <span className="text-xs text-slate-400">已取消</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {o.status === 'PENDING' && (
                        <div className="inline-flex items-center gap-3">
                          <button onClick={() => void pay(o.id)} disabled={busyId === `order-${o.id}`} className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 text-xs font-medium disabled:opacity-50">
                            {busyId === `order-${o.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />} 去支付
                          </button>
                          <button onClick={() => void cancel(o.id)} disabled={busyId === `cancel-${o.id}`} className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-500 text-xs font-medium disabled:opacity-50">
                            {busyId === `cancel-${o.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} 取消
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
