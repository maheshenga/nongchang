import React, { useState } from 'react';
import { Search, Plus, Filter, MoreVertical, MapPin, CheckCircle2, XCircle, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../hooks/useApi';
import { listMerchants, type MerchantUser } from '../api/agents';
import { createUser } from '../api/users';
import { Role, type CreateUserDto } from '@nongchang/shared';

type Merchant = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  location: string;
  status: 'active' | 'suspended' | 'pending';
  joinDate: string;
  rating: number;
};

export default function MerchantManagement() {
  const { data: rawMerchants, loading, error, reload } = useApi(listMerchants);
  const merchants: Merchant[] = (rawMerchants ?? []).map((m: MerchantUser) => ({
    id: m.id,
    name: m.displayName,
    contact: m.username,
    phone: '—',
    location: '—',
    status: 'active' as const,
    joinDate: '—',
    rating: 0,
  }));
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMerchant, setNewMerchant] = useState<Partial<Merchant>>({ status: 'pending' });

  const filteredMerchants = merchants.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.contact.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchant.name || !newMerchant.contact) return;
    try {
      const dto: CreateUserDto = {
        username: newMerchant.contact,
        password: 'password123',
        role: Role.MERCHANT,
        displayName: newMerchant.name,
      };
      await createUser(dto);
      setShowAddModal(false);
      setNewMerchant({ status: 'pending' });
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold flex items-center gap-1 w-max"><CheckCircle2 className="w-3 h-3" /> 正常营业</span>;
      case 'pending': return <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded text-xs font-bold flex items-center gap-1 w-max"><Filter className="w-3 h-3" /> 待审核</span>;
      case 'suspended': return <span className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs font-bold flex items-center gap-1 w-max"><XCircle className="w-3 h-3" /> 暂停业务</span>;
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
          onClick={() => setShowAddModal(true)}
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
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4" /> 状态筛选
          </button>
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
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">所在区域</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">入驻时间</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">状态</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredMerchants.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4">
                    <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{merchant.id}</span>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-slate-800 text-sm">{merchant.name}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{merchant.contact}</span>
                      <span className="text-xs text-slate-500">{merchant.phone}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> {merchant.location}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{merchant.joinDate}</td>
                  <td className="p-4">{getStatusBadge(merchant.status)}</td>
                  <td className="p-4 text-right">
                    <div className="flex flex-row justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button aria-label="更多操作" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><MoreVertical className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMerchants.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-sm">未能找到匹配的商户</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm shadow-xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-merchant-title"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 id="add-merchant-title" className="font-bold text-slate-800 flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-500" /> 新增入驻商户
                </h3>
                <button onClick={() => setShowAddModal(false)} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><XCircle className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddSubmit}>
                <div className="p-6 space-y-4">
                  <div>
                    <label htmlFor="add-merchant-name" className="block text-xs font-bold text-slate-500 mb-1">企业/商户名称 <span className="text-red-500">*</span></label>
                    <input
                      id="add-merchant-name"
                      type="text"
                      required
                      value={newMerchant.name || ''}
                      onChange={e => setNewMerchant({...newMerchant, name: e.target.value})}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="add-merchant-contact" className="block text-xs font-bold text-slate-500 mb-1">联系人 <span className="text-red-500">*</span></label>
                      <input
                        id="add-merchant-contact"
                        type="text"
                        required
                        value={newMerchant.contact || ''}
                        onChange={e => setNewMerchant({...newMerchant, contact: e.target.value})}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="add-merchant-phone" className="block text-xs font-bold text-slate-500 mb-1">手机号码</label>
                      <input
                        id="add-merchant-phone"
                        type="text"
                        value={newMerchant.phone || ''}
                        onChange={e => setNewMerchant({...newMerchant, phone: e.target.value})}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="add-merchant-location" className="block text-xs font-bold text-slate-500 mb-1">所在区域</label>
                    <input
                      id="add-merchant-location"
                      type="text"
                      value={newMerchant.location || ''}
                      onChange={e => setNewMerchant({...newMerchant, location: e.target.value})}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-200">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 rounded-lg text-sm transition-colors">取消</button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-sm transition-colors">确认添加</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
