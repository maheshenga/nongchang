import { useState } from 'react';
import { Check, RefreshCw, UserCheck, X } from 'lucide-react';
import type { PendingUserView } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { confirmDialog } from '../hooks/useDialog';
import { listPendingUsers, reviewUser } from '../api/users';
import { fluentButton, fluentTable } from '../ui/fluent';

export default function PendingUsers() {
  const { data, loading, error, reload } = useApi(listPendingUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = data ?? [];

  const onReview = async (u: PendingUserView, action: 'approve' | 'reject') => {
    const verb = action === 'approve' ? '通过' : '拒绝';
    if (!(await confirmDialog({ title: `${verb}入驻申请`, message: `确认${verb}用户「${u.displayName}」的入驻申请？`, confirmLabel: verb, tone: action === 'reject' ? 'danger' : 'default' }))) return;
    setBusyId(u.id); setErr(null);
    try {
      await reviewUser(u.id, { action });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally { setBusyId(null); }
  };

  const fmt = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString('zh-CN', { hour12: false });
  };

  return (
    <div className="flex h-full min-h-0 max-w-5xl flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <UserCheck className="h-5 w-5 text-[#0078D4]" />
            入驻审核
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">微信端自助注册用户在此等待审核。通过后用户方可登录，拒绝后状态变更为 rejected。</p>
        </div>
        <button type="button" onClick={() => void reload()} className={fluentButton('secondary')}>
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
      </header>

      {err && <div className="border border-[#F1B8BD] bg-[#FDE7E9] p-4 text-sm font-semibold text-[#A4262C]">{err}</div>}

      {loading && <div className="border border-[#E1DFDD] bg-white p-8 text-center text-sm text-[#605E5C]">加载中...</div>}
      {error && (
        <div className="border border-[#F1B8BD] bg-[#FDE7E9] p-4 text-sm text-[#A4262C]">
          加载失败: {error}
          <button type="button" onClick={() => void reload()} className="ml-2 inline-flex items-center gap-1 font-semibold underline">
            <RefreshCw className="h-3 w-3" /> 重试
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className={`${fluentTable.wrapper} overflow-x-auto`}>
          {pending.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#605E5C]">暂无待审核用户</div>
          ) : (
            <table className={`${fluentTable.table} min-w-[680px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>姓名 / 名称</th>
                  <th className={fluentTable.th}>手机号</th>
                  <th className={fluentTable.th}>申请时间</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id} className={fluentTable.row}>
                    <td className={`${fluentTable.td} font-semibold`}>{u.displayName}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{u.phone || '-'}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{fmt(u.createdAt)}</td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void onReview(u, 'approve')}
                          aria-label={`通过 ${u.displayName}`}
                          className={fluentButton('subtle')}
                        >
                          <Check className="h-4 w-4" /> 通过
                        </button>
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void onReview(u, 'reject')}
                          aria-label={`拒绝 ${u.displayName}`}
                          className={fluentButton('danger')}
                        >
                          <X className="h-4 w-4" /> 拒绝
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
