import React, { useState } from 'react';
import { Search, Plus, Building2, CheckCircle2, XCircle, Pencil, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../hooks/useApi';
import { listAgents, createAgent, updateAgent, setAgentStatus } from '../api/agents';
import { type AgentListItem, type CreateAgentDto, type UpdateAgentDto } from '@nongchang/shared';

type FormState = { name: string; region: string };
const emptyForm: FormState = { name: '', region: '' };

export default function AgentManagement() {
  const { data: rawAgents, loading, error, reload } = useApi(listAgents);
  const agents: AgentListItem[] = rawAgents ?? [];
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filteredAgents = agents.filter(a => {
    const q = searchQuery.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.region.toLowerCase().includes(q);
  });

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a: AgentListItem) => {
    setEditingId(a.id);
    setForm({ name: a.name, region: a.region });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.region) return;
    try {
      if (editingId) {
        const dto: UpdateAgentDto = { name: form.name, region: form.region };
        await updateAgent(editingId, dto);
      } else {
        const dto: CreateAgentDto = { name: form.name, region: form.region };
        await createAgent(dto);
      }
      closeModal();
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const toggleStatus = async (a: AgentListItem) => {
    const next = a.status === 'active' ? 'suspended' : 'active';
    const msg = next === 'suspended' ? '确认停用该代理商?停用后将无法登录。' : '确认启用该代理商?';
    if (!window.confirm(msg)) return;
    try {
      await setAgentStatus(a.id, next);
      void reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold flex items-center gap-1 w-max"><CheckCircle2 className="w-3 h-3" /> 正常</span>;
      case 'suspended': return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold flex items-center gap-1 w-max"><XCircle className="w-3 h-3" /> 已停用</span>;
      default: return null;
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-500" /> 代理商管理
          </h2>
          <p className="text-sm text-slate-500 mt-1">管理平台代理商组织、辖区及下辖商户</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> 新增代理商
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索代理商名称或辖区..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
          {error && <div className="p-8 text-center text-rose-500 text-sm">{error} <button onClick={() => void reload()} className="underline font-bold ml-2">重试</button></div>}
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">代理商名称</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">辖区</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">下辖商户数</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">状态</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">创建时间</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4">
                    <span className="font-bold text-slate-800 text-sm">{agent.name}</span>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{agent.region}</td>
                  <td className="p-4 text-sm text-slate-600">{agent.merchantCount}</td>
                  <td className="p-4">{getStatusBadge(agent.status)}</td>
                  <td className="p-4 text-sm text-slate-600">{new Date(agent.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 text-right">
                    <div className="flex flex-row justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(agent)}
                        aria-label="编辑代理商"
                        className="px-2 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                      >
                        <Pencil className="w-3.5 h-3.5" /> 编辑
                      </button>
                      <button
                        onClick={() => void toggleStatus(agent)}
                        aria-label={agent.status === 'active' ? '停用代理商' : '启用代理商'}
                        className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold ${
                          agent.status === 'active'
                            ? 'text-rose-500 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" /> {agent.status === 'active' ? '停用' : '启用'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">未能找到匹配的代理商</td>
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
              aria-labelledby="agent-modal-title"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 id="agent-modal-title" className="font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-500" /> {editingId ? '编辑代理商' : '新增代理商'}
                </h3>
                <button onClick={closeModal} aria-label="关闭" className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors"><XCircle className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                  <div>
                    <label htmlFor="agent-name" className="block text-xs font-bold text-slate-500 mb-1">代理商名称 <span className="text-red-500">*</span></label>
                    <input
                      id="agent-name"
                      type="text"
                      required
                      maxLength={128}
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="agent-region" className="block text-xs font-bold text-slate-500 mb-1">辖区 <span className="text-red-500">*</span></label>
                    <input
                      id="agent-region"
                      type="text"
                      required
                      maxLength={64}
                      value={form.region}
                      onChange={e => setForm({ ...form, region: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
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
