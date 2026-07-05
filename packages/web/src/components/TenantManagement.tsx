import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Plus, Power, PowerOff, X } from 'lucide-react';
import type { CreateTenantResponse, TenantListItem, TenantStatus } from '@nongchang/shared';
import { createTenant, listTenants, setTenantStatus } from '../api/tenants';

type FormState = {
  name: string;
  code: string;
  adminUsername: string;
  adminDisplayName: string;
  adminPhone: string;
};

const emptyForm: FormState = {
  name: '',
  code: '',
  adminUsername: '',
  adminDisplayName: '',
  adminPhone: '',
};

const inputClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

function statusLabel(status: TenantStatus): string {
  return status === 'active' ? '启用' : '停用';
}

export default function TenantManagement() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lastCreated, setLastCreated] = useState<CreateTenantResponse | null>(null);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      setTenants(await listTenants());
    } catch (err) {
      setError(err instanceof Error ? err.message : '租户列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const created = await createTenant({
        name: form.name.trim(),
        code: form.code.trim(),
        adminUsername: form.adminUsername.trim(),
        adminDisplayName: form.adminDisplayName.trim(),
        ...(form.adminPhone.trim() ? { adminPhone: form.adminPhone.trim() } : {}),
      });
      setLastCreated(created);
      setForm(emptyForm);
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '租户创建失败');
    }
  };

  const changeStatus = async (tenant: TenantListItem) => {
    const nextStatus: TenantStatus = tenant.status === 'active' ? 'suspended' : 'active';
    setBusyTenantId(tenant.id);
    setError('');
    try {
      await setTenantStatus(tenant.id, nextStatus);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '租户状态更新失败');
    } finally {
      setBusyTenantId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Building2 className="h-5 w-5 text-emerald-600" />
            租户管理
          </h2>
          <p className="mt-1 text-sm text-slate-500">平台管理员用于开通、停用和恢复租户。</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          新建租户
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {lastCreated && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          已创建 {lastCreated.name}，初始管理员 {lastCreated.adminUser.username}，初始密码 {lastCreated.initialPassword}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">租户</th>
              <th className="px-4 py-3">编码</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">用户</th>
              <th className="px-4 py-3 text-right">代理商</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中...
                  </span>
                </td>
              </tr>
            )}
            {!loading && tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无租户</td>
              </tr>
            )}
            {!loading && tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{tenant.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{tenant.code}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${tenant.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {statusLabel(tenant.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{tenant.userCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{tenant.agentCount}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void changeStatus(tenant)}
                    disabled={busyTenantId === tenant.id}
                    aria-label={`${tenant.status === 'active' ? '停用' : '启用'} ${tenant.code}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tenant.status === 'active' ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    {tenant.status === 'active' ? '停用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">新建租户</h3>
              <button
                type="button"
                onClick={() => setCreating(false)}
                aria-label="关闭"
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                租户名称
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                机构编码
                <input
                  value={form.code}
                  onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                  required
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                管理员账号
                <input
                  value={form.adminUsername}
                  onChange={(event) => setForm((prev) => ({ ...prev, adminUsername: event.target.value }))}
                  required
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                管理员姓名
                <input
                  value={form.adminDisplayName}
                  onChange={(event) => setForm((prev) => ({ ...prev, adminDisplayName: event.target.value }))}
                  required
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                管理员手机号
                <input
                  value={form.adminPhone}
                  onChange={(event) => setForm((prev) => ({ ...prev, adminPhone: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                创建
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
