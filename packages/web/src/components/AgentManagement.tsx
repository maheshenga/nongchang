import { useCallback, useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Pencil, Plus, Power, Search, X, XCircle } from 'lucide-react';
import { type AgentListItem, type CreateAgentDto, type UpdateAgentDto } from '@nongchang/shared';
import { createAgent, listAgents, setAgentStatus, updateAgent } from '../api/agents';
import { useApi } from '../hooks/useApi';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { MANAGEMENT_PAGE_SIZE, normalizePage, PaginationControls } from '../ui/pagination';

type FormState = { name: string; region: string };

const emptyForm: FormState = { name: '', region: '' };

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

export default function AgentManagement() {
  const [page, setPage] = useState(1);
  const fetchAgents = useCallback(() => listAgents({ page, pageSize: MANAGEMENT_PAGE_SIZE }), [page]);
  const { data: rawAgents, loading, error, reload } = useApi(fetchAgents);
  const agentPage = normalizePage<AgentListItem>(rawAgents, page);
  const agents = agentPage.items;
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filteredAgents = agents.filter((agent) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return agent.name.toLowerCase().includes(query) || agent.region.toLowerCase().includes(query);
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (agent: AgentListItem) => {
    setEditingId(agent.id);
    setForm({ name: agent.name, region: agent.region });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
      window.alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const toggleStatus = async (agent: AgentListItem) => {
    const next = agent.status === 'active' ? 'suspended' : 'active';
    const message = next === 'suspended'
      ? '确认停用该代理商？停用后该代理商账号将无法登录。'
      : '确认启用该代理商？';
    if (!window.confirm(message)) return;
    try {
      await setAgentStatus(agent.id, next);
      void reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#005A9E]">
            <Building2 className="h-4 w-4" />
            组织管理
          </div>
          <h2 className="mt-1 text-xl font-semibold text-[#242424]">代理商管理</h2>
          <p className="mt-1 text-sm text-[#605E5C]">管理代理商组织、辖区与下级商户归属</p>
        </div>
        <button type="button" onClick={openAdd} className={fluentButton('primary')}>
          <Plus className="h-4 w-4" />
          新增代理商
        </button>
      </header>

      <section className="flex min-h-0 flex-1 flex-col border border-[#E1DFDD] bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
            <input
              type="text"
              placeholder="搜索代理商名称或辖区"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={`${fluentInput} w-full pl-8`}
            />
          </div>
          {error && (
            <button type="button" onClick={() => void reload()} className={fluentButton('secondary')}>
              重试
            </button>
          )}
        </div>

        <div className="fluent-scrollbar min-h-0 flex-1 overflow-auto">
          {loading && <LoadingState label="加载代理商列表" />}
          {error && !loading && (
            <ErrorState message={error} onRetry={() => void reload()} className="m-4" />
          )}
          {!loading && !error && (
            <table className={`${fluentTable.table} min-w-[820px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>代理商名称</th>
                  <th className={fluentTable.th}>辖区</th>
                  <th className={fluentTable.th}>下级商户</th>
                  <th className={fluentTable.th}>状态</th>
                  <th className={fluentTable.th}>创建时间</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className={fluentTable.row}>
                    <td className={fluentTable.td}>
                      <div className="font-semibold text-[#242424]">{agent.name}</div>
                    </td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{agent.region}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{agent.merchantCount}</td>
                    <td className={fluentTable.td}>{statusTag(agent.status)}</td>
                    <td className={`${fluentTable.td} text-[#605E5C]`}>{new Date(agent.createdAt).toLocaleDateString()}</td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(agent)}
                          aria-label={`编辑代理商 ${agent.name}`}
                          className={fluentButton('subtle')}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(agent)}
                          aria-label={`${agent.status === 'active' ? '停用' : '启用'}代理商 ${agent.name}`}
                          className={agent.status === 'active' ? fluentButton('danger') : fluentButton('secondary')}
                        >
                          <Power className="h-4 w-4" />
                          {agent.status === 'active' ? '停用' : '启用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAgents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <EmptyState title="暂无匹配代理商" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {!error && (
          <PaginationControls
            page={agentPage.page}
            pageSize={agentPage.pageSize}
            total={agentPage.total}
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
            aria-labelledby="agent-modal-title"
            className="w-full max-w-lg overflow-hidden border border-[#E1DFDD] bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
              <h3 id="agent-modal-title" className="text-base font-semibold text-[#242424]">
                {editingId ? '编辑代理商' : '新增代理商'}
              </h3>
              <button type="button" onClick={closeModal} aria-label="关闭" className={fluentButton('icon')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 px-5 py-5">
                <div>
                  <label htmlFor="agent-name" className="mb-1.5 block text-sm font-semibold text-[#323130]">代理商名称</label>
                  <input
                    id="agent-name"
                    type="text"
                    required
                    maxLength={128}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    className={`${fluentInput} w-full`}
                  />
                </div>
                <div>
                  <label htmlFor="agent-region" className="mb-1.5 block text-sm font-semibold text-[#323130]">辖区</label>
                  <input
                    id="agent-region"
                    type="text"
                    required
                    maxLength={64}
                    value={form.region}
                    onChange={(event) => setForm({ ...form, region: event.target.value })}
                    className={`${fluentInput} w-full`}
                  />
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
