import { useState, useEffect, useCallback } from 'react';
import { Receipt, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getLedger } from '../api/billing';
import type { CreditLedgerItem, CreditResource, LedgerReason } from '@nongchang/shared';

const REASON_LABEL: Record<LedgerReason, string> = {
  RECHARGE: '充值', ALLOCATE_IN: '转入', ALLOCATE_OUT: '转出', CONSUME: '消费', REFUND: '退还', PURCHASE: '购买',
  RESERVED: '预约', CONFIRMED: '确认', RELEASED: '释放',
};
const RESOURCE_LABEL: Record<CreditResource, string> = { AI: 'AI算力', CODE: '二维码' };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 流水明细:资源 / 原因筛选 + 分页。内部管理 page 与 filter 状态。
export default function BillingLedger() {
  const [resource, setResource] = useState<'' | CreditResource>('');
  const [reason, setReason] = useState<'' | LedgerReason>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getLedger({
        page, pageSize,
        ...(resource ? { resource } : {}),
        ...(reason ? { reason } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [resource, reason, page]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selCls = 'px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <span className="font-bold text-slate-800 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-emerald-600" /> 流水明细
        </span>
        <div className="flex items-center gap-2">
          <select value={resource} onChange={(e) => { setPage(1); setResource(e.target.value as '' | CreditResource); }} className={selCls}>
            <option value="">全部资源</option>
            <option value="AI">AI算力</option>
            <option value="CODE">二维码</option>
          </select>
          <select value={reason} onChange={(e) => { setPage(1); setReason(e.target.value as '' | LedgerReason); }} className={selCls}>
            <option value="">全部类型</option>
            {(Object.keys(REASON_LABEL) as LedgerReason[]).map((r) => (
              <option key={r} value={r}>{REASON_LABEL[r]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 加载中…</div>}
      {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void load()} className="underline font-bold ml-2">重试</button></div>}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center text-slate-400 py-12">
          <Receipt className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">暂无流水记录</p>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2 font-medium">时间</th>
              <th className="px-4 py-2 font-medium">资源</th>
              <th className="px-4 py-2 font-medium">类型</th>
              <th className="px-4 py-2 font-medium text-right">变动</th>
              <th className="px-4 py-2 font-medium text-right">余额</th>
              <th className="px-4 py-2 font-medium">备注</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(it.createdAt).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-2 text-slate-600">{RESOURCE_LABEL[it.resource]}</td>
                <td className="px-4 py-2 text-slate-600">{REASON_LABEL[it.reason]}</td>
                <td className={`px-4 py-2 text-right font-mono font-medium ${it.delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {it.delta > 0 ? `+${it.delta}` : it.delta}
                </td>
                <td className="px-4 py-2 text-right font-mono text-slate-700">{it.balanceAfter}</td>
                <td className="px-4 py-2 text-slate-400 truncate max-w-[12rem]">{it.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm text-slate-500">
        <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-100 transition">
            <ChevronLeft className="w-4 h-4" /> 上一页
          </button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-100 transition">
            下一页 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
