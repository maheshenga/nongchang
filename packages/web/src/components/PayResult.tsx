import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { getOrder } from '../api/billing';
import type { CreditOrderView } from '@nongchang/shared';

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

const POLL_MS = 2000;
const TIMEOUT_MS = 60000;

// 支付宝支付完成后的同步回跳页(return_url)。实际入账以异步回调为准,这里轮询订单状态展示结果。
export default function PayResult({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<CreditOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const paid = order?.status === 'PAID';
  const [timedOut, setTimedOut] = useState(false);

  // 回调可能略有延迟:未支付时每 2s 查询指定订单,最多 60s;超时后转人工引导态。
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
      } catch (e) {
        if (stopped) return;
        setLoading(false);
        setError(e instanceof Error ? e.message : '订单状态查询失败');
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
        {paid ? (
          <>
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-slate-800">支付成功</h2>
            {order && (
              <p className="mt-2 text-sm text-slate-500">
                {order.planName ?? '自定义购买'} · 数量 {order.quantity.toLocaleString('zh-CN')} · {yuan(order.amountCents)},额度已到账
              </p>
            )}
          </>
        ) : order?.status === 'CANCELLED' ? (
          <>
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-slate-800">订单已取消</h2>
            <p className="mt-2 text-sm text-slate-500">该订单已取消,如仍需购买额度,请返回额度管理重新下单。</p>
          </>
        ) : error ? (
          <>
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-slate-800">状态查询失败</h2>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <button onClick={retry} className="mt-4 inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition">
              <RefreshCw className="w-4 h-4" /> 重新查询
            </button>
          </>
        ) : timedOut ? (
          <>
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-slate-800">尚未确认到账</h2>
            <p className="mt-2 text-sm text-slate-500">
              支付宝回调可能仍在处理中。若你已完成支付,可稍候点击「刷新状态」;如长时间未到账,请联系管理员核实订单。
            </p>
            <button onClick={retry} className="mt-4 inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition">
              <RefreshCw className="w-4 h-4" /> 刷新状态
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-16 h-16 text-emerald-500 mx-auto animate-spin" />
            <h2 className="mt-4 text-xl font-bold text-slate-800">正在确认支付结果</h2>
            <p className="mt-2 text-sm text-slate-500">
              {loading ? '正在读取订单状态…' : '支付宝回调到账可能略有延迟,正在为你刷新订单状态…'}
            </p>
          </>
        )}
        <div className="mt-6">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
            <ArrowLeft className="w-4 h-4" /> 返回额度管理
          </button>
        </div>
      </div>
    </div>
  );
}
