import { useCallback, useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { getLedger } from '../api/billing';
import type { CreditLedgerItem, CreditResource, LedgerReason } from '@nongchang/shared';
import { fluentButton, fluentSelect, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { totalPages } from '../ui/pagination';

const REASON_LABEL: Record<LedgerReason, string> = {
  RECHARGE: '充值',
  ALLOCATE_IN: '转入',
  ALLOCATE_OUT: '转出',
  CONSUME: '消费',
  REFUND: '退还',
  PURCHASE: '购买',
  RESERVED: '预约',
  CONFIRMED: '确认',
  RELEASED: '释放',
};

const RESOURCE_LABEL: Record<CreditResource, string> = { AI: 'AI算力', CODE: '二维码' };
const PAGE_SIZE = 20;

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function BillingLedger() {
  const [resource, setResource] = useState<'' | CreditResource>('');
  const [reason, setReason] = useState<'' | LedgerReason>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getLedger({
        page,
        pageSize: PAGE_SIZE,
        ...(resource ? { resource } : {}),
        ...(reason ? { reason } : {}),
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [page, reason, resource]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = totalPages(total, PAGE_SIZE);

  return (
    <div className="overflow-hidden border border-[#E1DFDD] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
          <Receipt className="h-4 w-4 text-[#0078D4]" />
          流水明细
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={resource}
            onChange={(event) => {
              setPage(1);
              setResource(event.target.value as '' | CreditResource);
            }}
            className={fluentSelect}
            aria-label="资源筛选"
          >
            <option value="">全部资源</option>
            <option value="AI">AI算力</option>
            <option value="CODE">二维码</option>
          </select>
          <select
            value={reason}
            onChange={(event) => {
              setPage(1);
              setReason(event.target.value as '' | LedgerReason);
            }}
            className={fluentSelect}
            aria-label="类型筛选"
          >
            <option value="">全部类型</option>
            {(Object.keys(REASON_LABEL) as LedgerReason[]).map((key) => (
              <option key={key} value={key}>
                {REASON_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-4">
        {loading && <LoadingState label="加载流水" />}
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState title="暂无流水记录" description="发生充值、分配、购买或消费后会在这里显示明细。" />
        )}

        {!loading && !error && items.length > 0 && (
          <div className={`${fluentTable.wrapper} overflow-x-auto`}>
            <table className={`${fluentTable.table} min-w-[760px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>时间</th>
                  <th className={fluentTable.th}>资源</th>
                  <th className={fluentTable.th}>类型</th>
                  <th className={`${fluentTable.th} text-right`}>变动</th>
                  <th className={`${fluentTable.th} text-right`}>余额</th>
                  <th className={fluentTable.th}>备注</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={fluentTable.row}>
                    <td className={`${fluentTable.td} whitespace-nowrap text-[#605E5C]`}>
                      {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{RESOURCE_LABEL[item.resource]}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{REASON_LABEL[item.reason]}</td>
                    <td className={`${fluentTable.td} text-right font-mono font-semibold ${item.delta < 0 ? 'text-[#A4262C]' : 'text-[#107C10]'}`}>
                      {item.delta > 0 ? `+${item.delta}` : item.delta}
                    </td>
                    <td className={`${fluentTable.td} text-right font-mono text-[#605E5C]`}>{item.balanceAfter}</td>
                    <td className={`${fluentTable.td} max-w-[12rem] truncate text-[#605E5C]`}>{item.note ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3 text-sm text-[#605E5C]">
        <span className="font-semibold text-[#323130]">
          共 {total} 条 · 第 {Math.min(page, pages)} / {pages} 页
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className={fluentButton('secondary')}
          >
            上一页
          </button>
          <button
            type="button"
            disabled={loading || page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            className={fluentButton('secondary')}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
