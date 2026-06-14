import { useState } from 'react';
import { Users, RefreshCw, Plus, Trash2, X } from 'lucide-react';
import type { UserGroupView, UserGroupInput } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listUserGroups, createUserGroup, updateUserGroup, deleteUserGroup } from '../api/user-group';

// 与后端 permissions.ts 保持一致的权限点
const PERMISSION_OPTIONS: { value: string; label: string }[] = [
  { value: 'record:create', label: '创建农事记录' },
  { value: 'record:view', label: '查看农事记录' },
  { value: 'trace:view', label: '查看溯源' },
  { value: 'batch:view', label: '查看批次' },
  { value: 'field:view', label: '查看地块' },
];

interface EditState {
  id: string | null;
  name: string;
  isDefault: boolean;
  permissions: string[];
}

const EMPTY: EditState = { id: null, name: '', isDefault: false, permissions: [] };

export default function UserGroups() {
  const { data, loading, error, reload } = useApi(listUserGroups);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groups = data ?? [];

  const openCreate = () => { setErr(null); setEdit({ ...EMPTY }); };
  const openEdit = (g: UserGroupView) => {
    setErr(null);
    setEdit({ id: g.id, name: g.name, isDefault: g.isDefault, permissions: [...g.permissions] });
  };

  const togglePerm = (value: string) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const has = prev.permissions.includes(value);
      return { ...prev, permissions: has ? prev.permissions.filter((p) => p !== value) : [...prev.permissions, value] };
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    setSubmitting(true); setErr(null);
    const dto: UserGroupInput = { name: edit.name.trim(), isDefault: edit.isDefault, permissions: edit.permissions };
    try {
      if (edit.id) await updateUserGroup(edit.id, dto);
      else await createUserGroup(dto);
      setEdit(null);
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally { setSubmitting(false); }
  };

  const onDelete = async (g: UserGroupView) => {
    if (!window.confirm(`确认删除用户组「${g.name}」?组内用户将被解除归属。`)) return;
    try {
      await deleteUserGroup(g.id);
      await reload();
    } catch (e2) {
      window.alert(e2 instanceof Error ? e2.message : '删除失败');
    }
  };

  const inputCls =
    'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <div className="p-1.5 bg-violet-100 text-violet-600 rounded-lg"><Users className="w-4 h-4" /></div>
          <h2 className="font-bold text-base">用户组与权限</h2>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> 新建用户组
        </button>
      </div>
      <p className="text-xs text-slate-500 -mt-3">微信新注册用户默认进入「默认用户组」。权限为叠加式:管理员不受限,普通用户按组内权限放行。</p>

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
          {groups.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">暂无用户组</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-bold">名称</th>
                  <th className="text-left px-5 py-3 font-bold">默认组</th>
                  <th className="text-left px-5 py-3 font-bold">权限</th>
                  <th className="text-right px-5 py-3 font-bold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-bold text-slate-700">{g.name}</td>
                    <td className="px-5 py-3">{g.isDefault ? <span className="text-emerald-600 font-bold">是</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-5 py-3 text-slate-500">{g.permissions.length ? g.permissions.length + ' 项' : '无'}</td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button onClick={() => openEdit(g)} className="text-emerald-600 hover:text-emerald-700 font-bold">编辑</button>
                      <button onClick={() => void onDelete(g)} className="text-rose-500 hover:text-rose-600 font-bold inline-flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{edit.id ? '编辑用户组' : '新建用户组'}</h3>
              <button onClick={() => setEdit(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => void onSubmit(e)} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">名称</label>
                <input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="如:记录员" required />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40" />
                <span className="text-sm text-slate-700 font-bold">设为默认组(微信新用户进入此组)</span>
              </label>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">权限点</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 rounded-lg px-3 py-2">
                      <input type="checkbox" checked={edit.permissions.includes(p.value)} onChange={() => togglePerm(p.value)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40" />
                      <span className="text-sm text-slate-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {err && <div className="text-sm text-rose-500 font-bold">{err}</div>}
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
                  {submitting ? '保存中…' : '保存'}
                </button>
                <button type="button" onClick={() => setEdit(null)} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2 rounded-lg text-sm font-bold transition-colors">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
