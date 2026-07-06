import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Plus, Power, PowerOff, X } from 'lucide-react';
import type { CreateTenantResponse, TenantListItem, TenantStatus } from '@nongchang/shared';
import { createTenant, listTenants, setTenantStatus } from '../api/tenants';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';

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

function statusLabel(status: TenantStatus): string {
  return status === 'active' ? '启用' : '停用';
}

export default function TenantManagement() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingTenant, setCreatingTenant] = useState(false);
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

  const openCreate = () => {
    setLastCreated(null);
    setForm(emptyForm);
    setCreating(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setCreatingTenant(true);
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
    } finally {
      setCreatingTenant(false);
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <Building2 className="h-5 w-5 text-[#0078D4]" />
            租户管理
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">平台管理员用于开通、停用和恢复租户，初始密码仅来自后端创建结果。</p>
        </div>
        <button type="button" onClick={openCreate} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" />
          新建租户
        </button>
      </header>

      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {lastCreated && (
        <div className="border border-[#92C353] bg-[#F1F9EE] px-4 py-3 text-sm text-[#107C10]">
          已创建 {lastCreated.name}，初始管理员 {lastCreated.adminUser.username}，初始密码 {lastCreated.initialPassword}
        </div>
      )}

      <div className={`${fluentTable.wrapper} overflow-x-auto`}>
        <table className={`${fluentTable.table} min-w-[760px]`}>
          <thead className={fluentTable.thead}>
            <tr>
              <th className={fluentTable.th}>租户</th>
              <th className={fluentTable.th}>编码</th>
              <th className={fluentTable.th}>状态</th>
              <th className={`${fluentTable.th} text-right`}>用户</th>
              <th className={`${fluentTable.th} text-right`}>代理商</th>
              <th className={`${fluentTable.th} text-right`}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-0">
                  <LoadingState label="加载租户列表" />
                </td>
              </tr>
            )}
            {!loading && tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState title="暂无租户" description="新建租户后会显示在这里。" />
                </td>
              </tr>
            )}
            {!loading && tenants.map((tenant) => (
              <tr key={tenant.id} className={fluentTable.row}>
                <td className={`${fluentTable.td} font-semibold`}>{tenant.name}</td>
                <td className={`${fluentTable.td} font-mono text-xs`}>{tenant.code}</td>
                <td className={fluentTable.td}>
                  <span className={fluentStatusTag(tenant.status === 'active' ? 'success' : 'neutral')}>
                    {statusLabel(tenant.status)}
                  </span>
                </td>
                <td className={`${fluentTable.td} text-right tabular-nums`}>{tenant.userCount}</td>
                <td className={`${fluentTable.td} text-right tabular-nums`}>{tenant.agentCount}</td>
                <td className={`${fluentTable.td} text-right`}>
                  <button
                    type="button"
                    onClick={() => void changeStatus(tenant)}
                    disabled={busyTenantId === tenant.id}
                    aria-label={`${tenant.status === 'active' ? '停用' : '启用'} ${tenant.code}`}
                    className={fluentButton('secondary')}
                  >
                    {tenant.status === 'active' ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    {tenant.status === 'active' ? '停用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="新建租户">
          <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5">
              <h3 className="text-base font-semibold text-[#242424]">新建租户</h3>
              <button type="button" onClick={() => setCreating(false)} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5">
              <label htmlFor="tenant-name" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                租户名称
                <input id="tenant-name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required className={`${fluentInput} w-full`} />
              </label>
              <label htmlFor="tenant-code" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                机构编码
                <input id="tenant-code" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} required className={`${fluentInput} w-full`} />
              </label>
              <label htmlFor="tenant-admin-username" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                管理员账号
                <input id="tenant-admin-username" value={form.adminUsername} onChange={(event) => setForm((prev) => ({ ...prev, adminUsername: event.target.value }))} required className={`${fluentInput} w-full`} />
              </label>
              <label htmlFor="tenant-admin-display-name" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                管理员姓名
                <input id="tenant-admin-display-name" value={form.adminDisplayName} onChange={(event) => setForm((prev) => ({ ...prev, adminDisplayName: event.target.value }))} required className={`${fluentInput} w-full`} />
              </label>
              <label htmlFor="tenant-admin-phone" className="grid gap-1 text-sm font-semibold text-[#605E5C]">
                管理员手机号
                <input id="tenant-admin-phone" value={form.adminPhone} onChange={(event) => setForm((prev) => ({ ...prev, adminPhone: event.target.value }))} className={`${fluentInput} w-full`} />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <button type="button" onClick={() => setCreating(false)} className={fluentButton('secondary')}>取消</button>
              <button type="submit" disabled={creatingTenant} className={fluentButton('primary')}>
                {creatingTenant && <Loader2 className="h-4 w-4 animate-spin" />}
                创建
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
