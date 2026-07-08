import { useState } from 'react';
import { Check, Clock, CreditCard, QrCode, ShoppingCart, X, Zap } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { cancelOrder, createOrder, createPayment, listCreditPlans, listOrders } from '../api/billing';
import { redirectToAlipayUrl, submitAlipayForm } from '../utils/alipay-form';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import type { CreditOrderView, CreditPlanView, CreditResource } from '@nongchang/shared';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

const RESOURCE_LABEL: Record<CreditResource, string> = { AI: 'AI算力', CODE: '二维码' };

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

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

function statusTag(order: CreditOrderView) {
  if (order.status === 'PAID') {
    return (
      <span className={fluentStatusTag('success')}>
        <Check className="h-3 w-3" />
        已支付
      </span>
    );
  }
  if (order.status === 'PENDING') {
    return (
      <span className={fluentStatusTag('warning')}>
        <Clock className="h-3 w-3" />
        待支付
      </span>
    );
  }
  return (
    <span className={fluentStatusTag('neutral')}>
      <X className="h-3 w-3" />
      已取消
    </span>
  );
}

export default function BillingPurchase({ onPaid }: { onPaid?: () => void }) {
  const plansApi = useApi(listCreditPlans);
  const ordersApi = useApi(() => listOrders({ pageSize: 20 }));
  const plans: CreditPlanView[] = plansApi.data ?? [];
  const orders: CreditOrderView[] = ordersApi.data?.items ?? [];

  const fixedPlans = plans.filter((p) => !p.isUnit && p.active);
  const unitResources = new Set(plans.filter((p) => p.isUnit && p.active).map((p) => p.resource));

  const [busyId, setBusyId] = useState<string>('');
  const [err, setErr] = useState('');
  const [customResource, setCustomResource] = useState<CreditResource>('AI');
  const [customQty, setCustomQty] = useState<number>(100);

  async function reload() {
    void plansApi.reload();
    void ordersApi.reload();
    onPaid?.();
  }

  async function buyPlan(plan: CreditPlanView) {
    setBusyId(`plan-${plan.id}`);
    setErr('');
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
    if (!customQty || customQty < 1) {
      setErr('请输入有效数量');
      return;
    }
    setBusyId('custom');
    setErr('');
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

  async function pay(orderId: string) {
    setBusyId(`order-${orderId}`);
    setErr('');
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

  async function cancel(orderId: string) {
    setBusyId(`cancel-${orderId}`);
    setErr('');
    try {
      await cancelOrder(orderId);
      await reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex items-center gap-2 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3 text-sm font-semibold text-[#242424]">
        <ShoppingCart className="h-4 w-4 text-[#0078D4]" />
        购买额度
      </div>

      <div className="space-y-6 p-5">
        {err && <ErrorState message={err} onRetry={() => setErr('')} retryLabel="关闭" />}

        {plansApi.loading && <LoadingState label="加载套餐" />}
        {plansApi.error && <ErrorState message={plansApi.error} onRetry={() => void plansApi.reload()} />}

        {!plansApi.loading && !plansApi.error && fixedPlans.length === 0 && unitResources.size === 0 && (
          <EmptyState title="暂无可购买套餐" description="请联系平台管理员配置套餐或单价基准。" />
        )}

        {fixedPlans.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fixedPlans.map((plan) => {
              const Icon = plan.resource === 'AI' ? Zap : QrCode;
              return (
                <div key={plan.id} className="flex min-h-[164px] flex-col border border-[#E1DFDD] bg-white p-4 transition-colors hover:border-[#0078D4]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#323130]">
                    <Icon className="h-4 w-4 text-[#0078D4]" />
                    {plan.name}
                  </div>
                  <div className="mt-3 font-mono text-2xl font-semibold text-[#242424]">
                    {plan.quantity.toLocaleString('zh-CN')}
                    <span className="ml-1 text-sm font-normal text-[#605E5C]">{plan.resource === 'AI' ? '次' : '个'}</span>
                  </div>
                  <div className="mt-1 text-base font-semibold text-[#107C10]">{yuan(plan.priceCents)}</div>
                  <button
                    type="button"
                    onClick={() => void buyPlan(plan)}
                    disabled={busyId === `plan-${plan.id}`}
                    className={`${fluentButton('primary')} mt-auto w-full`}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    购买
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {unitResources.size > 0 && (
          <div className="border border-dashed border-[#C8C6C4] bg-[#FAFAFA] p-4">
            <div className="mb-3 text-sm font-semibold text-[#323130]">自定义数量购买</div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#605E5C]">资源</label>
                <select value={customResource} onChange={(e) => setCustomResource(e.target.value as CreditResource)} className={fluentSelect}>
                  {unitResources.has('AI') && <option value="AI">AI算力</option>}
                  {unitResources.has('CODE') && <option value="CODE">二维码</option>}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#605E5C]">数量</label>
                <input
                  type="number"
                  min={1}
                  value={customQty}
                  onChange={(e) => setCustomQty(Number(e.target.value))}
                  className={`${fluentInput} w-32`}
                />
              </div>
              <button
                type="button"
                onClick={() => void buyCustom()}
                disabled={busyId === 'custom' || !unitResources.has(customResource)}
                className={fluentButton('primary')}
              >
                <ShoppingCart className="h-4 w-4" />
                购买
              </button>
            </div>
          </div>
        )}

        <section>
          <div className="mb-2 text-sm font-semibold text-[#323130]">我的订单</div>
          <p className="mb-3 text-xs leading-5 text-[#605E5C]">
            支付完成后额度由支付宝回调自动到账。若支付中断或取消，订单将保持「待支付」，可重新支付或取消。
          </p>

          {ordersApi.loading && <LoadingState label="加载订单" />}
          {ordersApi.error && <ErrorState message={ordersApi.error} onRetry={() => void ordersApi.reload()} />}
          {!ordersApi.loading && !ordersApi.error && orders.length === 0 && (
            <EmptyState title="暂无订单" description="完成购买后会在这里显示订单状态。" />
          )}

          {orders.length > 0 && (
            <div className={`${fluentTable.wrapper} overflow-x-auto`}>
              <table className={`${fluentTable.table} min-w-[680px]`}>
                <thead className={fluentTable.thead}>
                  <tr>
                    <th className={fluentTable.th}>套餐/资源</th>
                    <th className={`${fluentTable.th} text-right`}>数量</th>
                    <th className={`${fluentTable.th} text-right`}>金额</th>
                    <th className={`${fluentTable.th} text-center`}>状态</th>
                    <th className={`${fluentTable.th} text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className={fluentTable.row}>
                      <td className={`${fluentTable.td} font-semibold`}>
                        {order.planName ?? `${RESOURCE_LABEL[order.resource]}(自定义)`}
                      </td>
                      <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>
                        {order.quantity.toLocaleString('zh-CN')}
                      </td>
                      <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>{yuan(order.amountCents)}</td>
                      <td className={`${fluentTable.td} text-center`}>{statusTag(order)}</td>
                      <td className={`${fluentTable.td} text-right`}>
                        {order.status === 'PENDING' && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void pay(order.id)}
                              disabled={busyId === `order-${order.id}`}
                              className={fluentButton('subtle')}
                            >
                              <CreditCard className="h-4 w-4" />
                              去支付
                            </button>
                            <button
                              type="button"
                              onClick={() => void cancel(order.id)}
                              disabled={busyId === `cancel-${order.id}`}
                              className={fluentButton('danger')}
                            >
                              <X className="h-4 w-4" />
                              取消
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
