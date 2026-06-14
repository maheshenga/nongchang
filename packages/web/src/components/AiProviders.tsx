import { useState } from 'react';
import { Bot, Plus, RefreshCw } from 'lucide-react';
import type { AiProviderView, AiTestResponse } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listAiProviders, updateAiProvider, deleteAiProvider, testAiProvider } from '../api/ai-provider';
import AiProviderModal from './AiProviderModal';
import AiPlayground from './AiPlayground';

type TestState = 'loading' | AiTestResponse;

export default function AiProviders() {
  const { data, loading, error, reload } = useApi(listAiProviders);
  const providers = data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AiProviderView | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestState>>({});

  const onToggle = async (p: AiProviderView) => {
    try {
      await updateAiProvider(p.id, { enabled: !p.enabled });
      await reload();
    } catch {
      // 失败时静默并重新拉取以恢复真实状态
      await reload();
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('确定删除该 AI 服务商？此操作不可撤销。')) return;
    await deleteAiProvider(id);
    await reload();
  };

  const onTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const res = await testAiProvider(id);
      setTestResults((prev) => ({ ...prev, [id]: res }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, error: e instanceof Error ? e.message : '测试失败' },
      }));
    }
  };

  const renderTest = (id: string) => {
    const r = testResults[id];
    if (!r) return null;
    if (r === 'loading') return <span className="text-[10px] text-slate-400">测试中…</span>;
    if (r.ok) return <span className="text-[10px] text-emerald-600 font-bold">✓ {r.latencyMs ?? '-'}ms</span>;
    return <span className="text-[10px] text-rose-500 font-bold" title={r.error}>✗ {r.error ?? '失败'}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
              <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                <Bot className="w-4 h-4" />
              </div>
              AI 服务商管理
            </h3>
            <p className="text-xs text-slate-500 mt-1">配置大模型服务接入，密钥加密存储，同租户仅一个服务商可启用</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-xs transition-colors shadow-sm font-bold whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" /> 新增服务商
          </button>
        </div>

        <div className="overflow-x-auto p-0">
          {loading && <div className="p-8 text-center text-slate-400 text-sm">加载中…</div>}
          {error && (
            <div className="p-8 text-center text-rose-500 text-sm">
              加载失败：{error}
              <button onClick={() => void reload()} className="underline font-bold ml-2 inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> 重试
              </button>
            </div>
          )}
          {!loading && !error && providers.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">暂无 AI 服务商，点击右上角新增。</div>
          )}
          {!loading && !error && providers.length > 0 && (
            <table className="w-full text-left whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 uppercase tracking-widest bg-slate-100/80 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-bold">名称</th>
                  <th className="px-5 py-3 font-bold">Base URL</th>
                  <th className="px-5 py-3 font-bold">文本模型</th>
                  <th className="px-5 py-3 font-bold">视觉模型</th>
                  <th className="px-5 py-3 font-bold">密钥</th>
                  <th className="px-5 py-3 font-bold">启用</th>
                  <th className="px-5 py-3 font-bold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 text-sm">
                {providers.map((p) => (
                  <tr key={p.id} className="hover:bg-indigo-50/20 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-800">{p.name}</td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs max-w-[200px] truncate" title={p.baseUrl}>{p.baseUrl}</td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{p.textModel}</td>
                    <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{p.visionModel ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{p.apiKeyMasked}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => void onToggle(p)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors ${
                          p.enabled
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                            : 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}>
                        {p.enabled ? '已启用' : '已禁用'}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {renderTest(p.id)}
                        <button onClick={() => setEditing(p)}
                          className="text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg transition-colors font-bold">编辑</button>
                        <button onClick={() => void onTest(p.id)}
                          className="text-[10px] text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors font-bold">测试</button>
                        <button onClick={() => void onDelete(p.id)}
                          className="text-[10px] text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 px-3 py-1.5 rounded-lg transition-colors font-bold">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(showCreate || editing) && (
        <AiProviderModal
          provider={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={() => { setShowCreate(false); setEditing(null); void reload(); }}
        />
      )}

      <AiPlayground />
    </div>
  );
}
