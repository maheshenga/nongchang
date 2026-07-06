import { useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { Permission, type Permission as PermissionValue, type UserGroupInput, type UserGroupView } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { createUserGroup, deleteUserGroup, listUserGroups, updateUserGroup } from '../api/user-group';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';

const PERMISSION_OPTIONS: { value: PermissionValue; label: string }[] = [
  { value: Permission.RECORD_CREATE, label: '创建农事记录' },
  { value: Permission.RECORD_VIEW, label: '查看农事记录' },
  { value: Permission.TRACE_VIEW, label: '查看溯源' },
  { value: Permission.BATCH_VIEW, label: '查看批次' },
  { value: Permission.FIELD_VIEW, label: '查看地块' },
];

interface EditState {
  id: string | null;
  name: string;
  isDefault: boolean;
  permissions: PermissionValue[];
}

const EMPTY: EditState = { id: null, name: '', isDefault: false, permissions: [] };

function knownPermissions(permissions: string[]): PermissionValue[] {
  return permissions.filter((permission): permission is PermissionValue =>
    Object.values(Permission).includes(permission as PermissionValue),
  );
}

export default function UserGroups() {
  const { data, loading, error, reload } = useApi(listUserGroups);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const groups = data ?? [];

  const openCreate = () => { setErr(null); setEdit({ ...EMPTY }); };
  const openEdit = (g: UserGroupView) => {
    setErr(null);
    setEdit({
      id: g.id,
      name: g.name,
      isDefault: g.isDefault,
      permissions: knownPermissions(g.permissions),
    });
  };

  const togglePerm = (value: PermissionValue) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const has = prev.permissions.includes(value);
      return { ...prev, permissions: has ? prev.permissions.filter((p) => p !== value) : [...prev.permissions, value] };
    });
  };

  const onSubmit = async (e: FormEvent) => {
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
    if (!window.confirm(`确认删除用户组「${g.name}」？如果仍有关联用户，后端可能拒绝删除。`)) return;
    try {
      await deleteUserGroup(g.id);
      await reload();
    } catch (e2) {
      window.alert(e2 instanceof Error ? e2.message : '删除失败');
    }
  };

  return (
    <div className="flex h-full min-h-0 max-w-5xl flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <Users className="h-5 w-5 text-[#0078D4]" />
            用户分组
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">
            微信新注册用户默认进入「默认用户组」。经营角色在已接入接口会按用户组权限放行；当前已接入: 创建农事记录、查看农事记录、查看地块、查看批次、查看溯源。管理员与未接入接口仍按角色与业务范围鉴权。
          </p>
        </div>
        <button type="button" onClick={openCreate} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" /> 新建用户组
        </button>
      </header>

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
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#605E5C]">暂无用户组</div>
          ) : (
            <table className={`${fluentTable.table} min-w-[720px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>名称</th>
                  <th className={fluentTable.th}>默认组</th>
                  <th className={fluentTable.th}>接口权限</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const knownCount = knownPermissions(g.permissions).length;
                  return (
                    <tr key={g.id} className={fluentTable.row}>
                      <td className={`${fluentTable.td} font-semibold`}>{g.name}</td>
                      <td className={fluentTable.td}>
                        {g.isDefault ? <span className={fluentStatusTag('active')}>是</span> : <span className="text-[#605E5C]">-</span>}
                      </td>
                      <td className={`${fluentTable.td} text-[#605E5C]`}>{knownCount ? `${knownCount} 项` : '未配置'}</td>
                      <td className={`${fluentTable.td} text-right`}>
                        <div className="inline-flex gap-2">
                          <button type="button" onClick={() => openEdit(g)} aria-label={`编辑 ${g.name}`} className={fluentButton('subtle')}>编辑</button>
                          <button type="button" onClick={() => void onDelete(g)} aria-label={`删除 ${g.name}`} className={fluentButton('danger')}>
                            <Trash2 className="h-4 w-4" /> 删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label={edit.id ? '编辑用户组' : '新建用户组'}>
          <div className="w-full max-w-lg overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5">
              <h3 className="text-base font-semibold text-[#242424]">{edit.id ? '编辑用户组' : '新建用户组'}</h3>
              <button type="button" onClick={() => setEdit(null)} aria-label="关闭" className={fluentButton('icon')}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 p-5">
              <label htmlFor="group-name" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                名称
                <input id="group-name" aria-label="名称" className={`${fluentInput} w-full`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="如: 记录员" required />
              </label>
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} className="h-4 w-4 rounded border-[#C8C6C4] text-[#0078D4] focus:ring-[#0078D4]/40" />
                <span className="text-sm font-semibold text-[#242424]">设为默认组，微信新用户进入此组</span>
              </label>
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#605E5C]">接口权限（部分接口已接入）</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PERMISSION_OPTIONS.map((p) => (
                    <label key={p.value} className="flex cursor-pointer select-none items-center gap-2 border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2">
                      <input type="checkbox" checked={edit.permissions.includes(p.value)} onChange={() => togglePerm(p.value)} className="h-4 w-4 rounded border-[#C8C6C4] text-[#0078D4] focus:ring-[#0078D4]/40" />
                      <span className="text-sm text-[#242424]">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {err && <div className="text-sm font-semibold text-[#A4262C]">{err}</div>}
              <div className="flex justify-end gap-2 border-t border-[#E1DFDD] pt-4">
                <button type="button" onClick={() => setEdit(null)} className={fluentButton('secondary')}>取消</button>
                <button type="submit" disabled={submitting} className={fluentButton('primary')}>{submitting ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
