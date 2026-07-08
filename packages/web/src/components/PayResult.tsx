import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { CreditOrderView } from '@nongchang/shared';
import { getOrder } from '../api/billing';
import { fluentButton } from '../ui/fluent';

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

const POLL_MS = 2000;
const TIMEOUT_MS = 60000;

export default function PayResult({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<CreditOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const paid = order?.status === 'PAID';

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + TIMEOUT_MS;

    async function poll() {
      setLoading(true);
      setError('');
      try {
        const next = await getOrder(orderId);
        if (stopped) return;
        setOrder(next);
        setLoading(false);
        if (next.status === 'PAID' || next.status === 'CANCELLED') return;
        if (Date.now() >= deadline) {
          setTimedOut(true);
          return;
        }
        timer = setTimeout(() => { void poll(); }, POLL_MS);
      } catch (err) {
        if (stopped) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : '订单状态查询失败');
      }
    }

    setTimedOut(false);
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, retryKey]);

  function retry() {
    setTimedOut(false);
    setRetryKey((value) => value + 1);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] p-4 text-[#242424]">
      <main className="w-full max-w-md border border-[#E1DFDD] bg-white p-8 text-center shadow-sm">
        {paid ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-[#107C10]" />
            <h1 className="mt-4 text-xl font-semibold text-[#242424]">支付成功</h1>
            {order && (
              <p className="mt-2 text-sm leading-6 text-[#605E5C]">
                {order.planName ?? '自定义购买'} · 数量 {order.quantity.toLocaleString('zh-CN')} · {yuan(order.amountCents)}，额度已到账
              </p>
            )}
          </>
        ) : order?.status === 'CANCELLED' ? (
          <>
            <AlertTriangle className="mx-auto h-14 w-14 text-[#8A6A00]" />
            <h1 className="mt-4 text-xl font-semibold text-[#242424]">订单已取消</h1>
            <p className="mt-2 text-sm leading-6 text-[#605E5C]">
              该订单已取消，如仍需购买额度，请返回额度管理重新下单。
            </p>
          </>
        ) : error ? (
          <>
            <AlertTriangle className="mx-auto h-14 w-14 text-[#A4262C]" />
            <h1 className="mt-4 text-xl font-semibold text-[#242424]">状态查询失败</h1>
            <p className="mt-2 text-sm leading-6 text-[#605E5C]">{error}</p>
            <button type="button" onClick={retry} className={`${fluentButton('secondary')} mt-4`}>
              <RefreshCw className="h-4 w-4" />
              重新查询
            </button>
          </>
        ) : timedOut ? (
          <>
            <AlertTriangle className="mx-auto h-14 w-14 text-[#8A6A00]" />
            <h1 className="mt-4 text-xl font-semibold text-[#242424]">尚未确认到账</h1>
            <p className="mt-2 text-sm leading-6 text-[#605E5C]">
              支付宝回调可能仍在处理中。若你已完成支付，可稍候点击「刷新状态」；如长时间未到账，请联系管理员核实订单。
            </p>
            <button type="button" onClick={retry} className={`${fluentButton('secondary')} mt-4`}>
              <RefreshCw className="h-4 w-4" />
              刷新状态
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-[#0078D4]" />
            <h1 className="mt-4 text-xl font-semibold text-[#242424]">正在确认支付结果</h1>
            <p className="mt-2 text-sm leading-6 text-[#605E5C]">
              {loading ? '正在读取订单状态...' : '支付宝回调到账可能略有延迟，正在为你刷新订单状态...'}
            </p>
          </>
        )}

        <div className="mt-6">
          <button type="button" onClick={onBack} className={fluentButton('primary')}>
            <ArrowLeft className="h-4 w-4" />
            返回额度管理
          </button>
        </div>
      </main>
    </div>
  );
}
