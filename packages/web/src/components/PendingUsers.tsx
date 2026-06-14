import { useState } from 'react';
import { UserCheck, RefreshCw, Check, X } from 'lucide-react';
import type { PendingUserView } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listPendingUsers, reviewUser } from '../api/users';

export default function PendingUsers() {
  const { data, loading, error, reload } = useApi(listPendingUsers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = data ?? [];

  const onReview = async (u: PendingUserView, action: 'approve' | 'reject') => {
    const verb = action === 'approve' ? '通过' : '拒绝';
    if (!window.confirm(`确认${verb}用户「${u.displayName}」的入驻申请?`)) return;
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg"><UserCheck className="w-4 h-4" /></div>
          <h2 className="font-bold text-base">入驻审核</h2>
        </div>
        <button onClick={() => void reload()} className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>
      <p className="text-xs text-slate-500 -mt-3">微信端自助注册的用户在此等待审核。通过后用户方可登录;拒绝后将无法登录。</p>

      {err && <div className="text-sm text-rose-500 font-bold">{err}</div>}

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
          {pending.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">暂无待审核用户</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">姓名 / 名称</th>
                  <th className="text-left px-5 py-3 font-bold">手机号</th>
                  <th className="text-left px-5 py-3 font-bold">申请时间</th>
                  <th className="text-right px-5 py-3 font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-bold text-slate-700">{u.displayName}</td>
                    <td className="px-5 py-3 text-slate-500">{u.phone || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{fmt(u.createdAt)}</td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button disabled={busyId === u.id} onClick={() => void onReview(u, 'approve')}
                        className="text-emerald-600 hover:text-emerald-700 font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" /> 通过
                      </button>
                      <button disabled={busyId === u.id} onClick={() => void onReview(u, 'reject')}
                        className="text-rose-500 hover:text-rose-600 font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        <X className="w-3.5 h-3.5" /> 拒绝
                      </button>
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
