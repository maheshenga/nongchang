import { useCallback, useState, type FormEvent } from 'react';
import { CheckCircle2, Filter, Pencil, Plus, Power, Search, Store, X, XCircle } from 'lucide-react';
import { Role, type CreateUserDto, type MerchantListItem, type UpdateUserDto } from '@nongchang/shared';
import { createUser, listMerchants, setUserStatus, updateUser } from '../api/users';
import { useApi } from '../hooks/useApi';
import { alertDialog, confirmDialog } from '../hooks/useDialog';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { MANAGEMENT_PAGE_SIZE, normalizePage, PaginationControls } from '../ui/pagination';

type FormState = { displayName: string; username: string; phone: string };
type StatusFilter = 'all' | 'active' | 'suspended';

const emptyForm: FormState = { displayName: '', username: '', phone: '' };

function statusTag(status: string) {
  if (status === 'active') {
    return (
      <span className={fluentStatusTag('success')}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        正常
      </span>
    );
  }
  if (status === 'suspended') {
    return (
      <span className={fluentStatusTag('neutral')}>
        <XCircle className="mr-1 h-3 w-3" />
        已停用
      </span>
    );
  }
  return <span className={fluentStatusTag('neutral')}>{status}</span>;
}

const statusOptions: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '正常' },
  { key: 'suspended', label: '已停用' },
];

export default function MerchantManagement() {
  const [page, setPage] = useState(1);
  const fetchMerchants = useCallback(() => listMerchants({ page, pageSize: MANAGEMENT_PAGE_SIZE }), [page]);
  const { data: rawMerchants, loading, error, reload } = useApi(fetchMerchants, { cacheKey: `merchants-page-${page}` });
  const merchantPage = normalizePage<MerchantListItem>(rawMerchants, page);
  const merchants = merchantPage.items;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filteredMerchants = merchants.filter((merchant) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query
      || merchant.displayName.toLowerCase().includes(query)
      || merchant.username.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || merchant.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (merchant: MerchantListItem) => {
    setEditingId(merchant.id);
    setForm({ displayName: merchant.displayName, username: merchant.username, phone: merchant.phone ?? '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.displayName || !form.username) return;
    try {
      if (editingId) {
        const dto: UpdateUserDto = { displayName: form.displayName, phone: form.phone || null };
        await updateUser(editingId, dto);
      } else {
        const dto: CreateUserDto = {
          username: form.username,
          role: Role.MERCHANT,
          displayName: form.displayName,
          phone: form.phone || undefined,
        };
        const result = await createUser(dto);
        await alertDialog({ title: '商户已创建', message: `商户已创建。初始密码: ${result.initialPassword}，请转交商户并提醒尽快修改。` });
      }
      closeModal();
      void reload();
    } catch (err) {
      await alertDialog({ title: '操作失败', message: err instanceof Error ? err.message : '操作失败', tone: 'danger' });
    }
  };

  const toggleStatus = async (merchant: MerchantListItem) => {
    const next = merchant.status === 'active' ? 'suspended' : 'active';
    const message = next === 'suspended'
      ? '确认停用该商户？停用后该账号将无法登录。'
      : '确认启用该商户？';
    if (!(await confirmDialog({ title: next === 'suspended' ? '停用商户' : '启用商户', message, confirmLabel: next === 'suspended' ? '停用' : '启用', tone: next === 'suspended' ? 'danger' : 'default' }))) return;
    try {
      await setUserStatus(merchant.id, next);
      void reload();
    } catch (err) {
      await alertDialog({ title: '操作失败', message: err instanceof Error ? err.message : '操作失败', tone: 'danger' });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#005A9E]">
            <Store className="h-4 w-4" />
            商户档案
          </div>
          <h2 className="mt-1 text-xl font-semibold text-[#242424]">商户管理与档案</h2>
          <p className="mt-1 text-sm text-[#605E5C]">管理入驻平台的商户、联系人与账号状态</p>
        </div>
        <button type="button" onClick={openAdd} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" />
          新增入驻
        </button>
      </header>

      <section className="flex min-h-0 flex-1 flex-col border border-[#E1DFDD] bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
            <input
              type="text"
              placeholder="搜索商户名称或联系人"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={`${fluentInput} w-full pl-8`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="状态筛选">
            <Filter className="h-4 w-4 text-[#605E5C]" />
            {statusOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatusFilter(option.key)}
                aria-pressed={statusFilter === option.key}
                className={statusFilter === option.key ? fluentButton('primary') : fluentButton('secondary')}
              >
                {option.label}
              </button>
            ))}
          </div>
          {error && (
            <button type="button" onClick={() => void reload()} className={fluentButton('secondary')}>
              重试
            </button>
          )}
        </div>

        <div className="fluent-scrollbar min-h-0 flex-1 overflow-auto">
          {loading && <LoadingState label="加载商户列表" />}
          {error && !loading && (
            <ErrorState message={error} onRetry={() => void reload()} className="m-4" />
          )}
          {!loading && !error && (
            <table className={`${fluentTable.table} min-w-[980px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>商户编号</th>
                  <th className={fluentTable.th}>企业名称</th>
                  <th className={fluentTable.th}>联系人 / 电话</th>
                  <th className={fluentTable.th}>地块数</th>
                  <th className={fluentTable.th}>确权面积</th>
                  <th className={fluentTable.th}>状态</th>
                  <th className={fluentTable.th}>入驻时间</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredMerchants.map((merchant) => (
                  <tr key={merchant.id} className={fluentTable.row}>
                    <td className={fluentTable.td}>
                      <span className="font-mono text-xs font-semibold text-[#605E5C]">{merchant.id.slice(0, 8)}</span>
                    </td>
                    <td className={fluentTable.td}>
                      <div className="font-semibold text-[#242424]">{merchant.displayName}</div>
                    </td>
                    <td className={fluentTable.td}>
                      <div className="font-semibold text-[#323130]">{merchant.username}</div>
                      <div className="text-xs text-[#605E5C]">{merchant.phone ?? '未填'}</div>
                    </td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{merchant.fieldCount}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{merchant.totalArea.toFixed(1)} 亩</td>
                    <td className={fluentTable.td}>{statusTag(merchant.status)}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{new Date(merchant.createdAt).toLocaleDateString()}</td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(merchant)}
                          aria-label={`编辑商户 ${merchant.displayName}`}
                          className={fluentButton('subtle')}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(merchant)}
                          aria-label={`${merchant.status === 'active' ? '停用' : '启用'}商户 ${merchant.displayName}`}
                          className={merchant.status === 'active' ? fluentButton('danger') : fluentButton('secondary')}
                        >
                          <Power className="h-4 w-4" />
                          {merchant.status === 'active' ? '停用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredMerchants.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <EmptyState title="暂无匹配商户" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {!error && (
          <PaginationControls
            page={merchantPage.page}
            pageSize={merchantPage.pageSize}
            total={merchantPage.total}
            loading={loading}
            onPageChange={setPage}
          />
        )}
      </section>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="merchant-modal-title"
            className="w-full max-w-xl overflow-hidden border border-[#E1DFDD] bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <h3 id="merchant-modal-title" className="text-base font-semibold text-[#242424]">
                {editingId ? '编辑商户档案' : '新增入驻商户'}
              </h3>
              <button type="button" onClick={closeModal} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-5 py-5">
                <div>
                  <label htmlFor="merchant-name" className="mb-1.5 block text-sm font-semibold text-[#323130]">企业 / 商户名称</label>
                  <input
                    id="merchant-name"
                    type="text"
                    required
                    value={form.displayName}
                    onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                    className={`${fluentInput} w-full`}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="merchant-username" className="mb-1.5 block text-sm font-semibold text-[#323130]">联系人 / 用户名</label>
                    <input
                      id="merchant-username"
                      type="text"
                      required
                      minLength={3}
                      disabled={!!editingId}
                      value={form.username}
                      onChange={(event) => setForm({ ...form, username: event.target.value })}
                      className={`${fluentInput} w-full disabled:bg-[#F3F2F1] disabled:text-[#8A8886]`}
                    />
                  </div>
                  <div>
                    <label htmlFor="merchant-phone" className="mb-1.5 block text-sm font-semibold text-[#323130]">手机号码</label>
                    <input
                      id="merchant-phone"
                      type="text"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      className={`${fluentInput} w-full`}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
                <button type="button" onClick={closeModal} className={fluentButton('secondary')}>取消</button>
                <button type="submit" className={fluentButton('primary')}>
                  {editingId ? '保存修改' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
