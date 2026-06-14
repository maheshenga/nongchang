import React, { useState } from 'react';
import { Search, Plus, Filter, CheckCircle2, XCircle, Store, Pencil, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../hooks/useApi';
import { listMerchants, createUser, updateUser, setUserStatus } from '../api/users';
import { Role, type MerchantListItem, type CreateUserDto, type UpdateUserDto } from '@nongchang/shared';

type FormState = { displayName: string; username: string; phone: string };
const emptyForm: FormState = { displayName: '', username: '', phone: '' };

export default function MerchantManagement() {
  const { data: rawMerchants, loading, error, reload } = useApi(listMerchants);
  const merchants: MerchantListItem[] = rawMerchants ?? [];
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filteredMerchants = merchants.filter(m => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (m: MerchantListItem) => {
    setEditingId(m.id);
    setForm({ displayName: m.displayName, username: m.username, phone: m.phone ?? '' });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        const res = await createUser(dto);
        window.alert('商户已创建。初始密码:' + res.initialPassword + ',请转交商户并提醒尽快修改。');
      }
      closeModal();
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const toggleStatus = async (m: MerchantListItem) => {
    const next = m.status === 'active' ? 'suspended' : 'active';
    const msg = next === 'suspended' ? '确认停用该商户?停用后将无法登录。' : '确认启用该商户?';
    if (!window.confirm(msg)) return;
    try {
      await setUserStatus(m.id, next);
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold flex items-center gap-1 w-max"><CheckCircle2 className="w-3 h-3" /> 正常营业</span>;
      case 'suspended': return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold flex items-center gap-1 w-max"><XCircle className="w-3 h-3" /> 已停用</span>;
      default: return null;
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <Store className="w-6 h-6 text-indigo-500" /> 商户管理与档案
          </h2>
          <p className="text-sm text-slate-500 mt-1">管理入驻平台的生态商家、权限及资质审核</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> 新增入驻
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜索商户名称或负责人..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="状态筛选">
            <Filter className="w-4 h-4 text-slate-400" />
            {([
              { key: 'all', label: '全部' },
              { key: 'active', label: '正常' },
              { key: 'suspended', label: '已停用' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                aria-pressed={statusFilter === opt.key}
                className={`px-3 py-2 rounded-lg font-bold text-sm transition-colors ${
                  statusFilter === opt.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
          {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">商户编号</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">企业名称</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">联系人 / 电话</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">地块数</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">确权面积</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">状态</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">入驻时间</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredMerchants.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4">
                    <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{merchant.id.slice(0, 8)}</span>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-slate-800 text-sm">{merchant.displayName}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{merchant.username}</span>
                      <span className="text-xs text-slate-500">{merchant.phone ?? '未填'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{merchant.fieldCount}</td>
                  <td className="p-4 text-sm text-slate-600">{merchant.totalArea.toFixed(1)} 亩</td>
                  <td className="p-4">{getStatusBadge(merchant.status)}</td>
                  <td className="p-4 text-sm text-slate-600">{new Date(merchant.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 text-right">
                    <div className="flex flex-row justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(merchant)}
                        aria-label="编辑商户"
                        className="px-2 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                      >
                        <Pencil className="w-3.5 h-3.5" /> 编辑
                      </button>
                      <button
                        onClick={() => void toggleStatus(merchant)}
                        aria-label={merchant.status === 'active' ? '停用商户' : '启用商户'}
                        className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold ${
                          merchant.status === 'active'
                            ? 'text-rose-500 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" /> {merchant.status === 'active' ? '停用' : '启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMerchants.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 text-sm">未能找到匹配的商户</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm shadow-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="merchant-modal-title"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 id="merchant-modal-title" className="font-bold text-slate-800 flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-500" /> {editingId ? '编辑商户档案' : '新增入驻商户'}
                </h3>
                <button onClick={closeModal} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><XCircle className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                  <div>
                    <label htmlFor="merchant-name" className="block text-xs font-bold text-slate-500 mb-1">企业/商户名称 <span className="text-red-500">*</span></label>
                    <input
                      id="merchant-name"
                      type="text"
                      required
                      value={form.displayName}
                      onChange={e => setForm({ ...form, displayName: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="merchant-username" className="block text-xs font-bold text-slate-500 mb-1">联系人 / 用户名 <span className="text-red-500">*</span></label>
                      <input
                        id="merchant-username"
                        type="text"
                        required
                        minLength={3}
                        disabled={!!editingId}
                        value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="merchant-phone" className="block text-xs font-bold text-slate-500 mb-1">手机号码</label>
                      <input
                        id="merchant-phone"
                        type="text"
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-200">
                  <button type="button" onClick={closeModal} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 rounded-lg text-sm transition-colors">取消</button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-sm transition-colors">{editingId ? '保存修改' : '确认添加'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
