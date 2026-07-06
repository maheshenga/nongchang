import { useState } from 'react';
import { Bot, CheckCircle2, Pencil, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import type { AiProviderView, AiTestResponse } from '@nongchang/shared';
import { deleteAiProvider, listAiProviders, testAiProvider, updateAiProvider } from '../api/ai-provider';
import { useApi } from '../hooks/useApi';
import { fluentButton, fluentTable } from '../ui/fluent';
import AiProviderModal from './AiProviderModal';
import AiPlayground from './AiPlayground';

type TestState = 'loading' | AiTestResponse;

function testResultLabel(result: TestState | undefined) {
  if (!result) return null;
  if (result === 'loading') return <span className="text-xs font-semibold text-[#605E5C]">测试中...</span>;
  if (result.ok) {
    return (
      <span className="inline-flex items-center text-xs font-semibold text-[#107C10]">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        连接正常 {result.latencyMs ?? '-'}ms
      </span>
    );
  }
  return <span className="max-w-[180px] truncate text-xs font-semibold text-[#A4262C]" title={result.error}>{result.error ?? '失败'}</span>;
}

export default function AiProviders() {
  const { data, loading, error, reload } = useApi(listAiProviders);
  const providers = data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AiProviderView | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestState>>({});

  const onToggle = async (provider: AiProviderView) => {
    try {
      await updateAiProvider(provider.id, { enabled: !provider.enabled });
      await reload();
    } catch {
      await reload();
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('确定删除该 AI 服务商？此操作不可撤销。')) return;
    try {
      await deleteAiProvider(id);
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const onTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const result = await testAiProvider(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, error: err instanceof Error ? err.message : '测试失败' },
      }));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="flex min-h-[320px] flex-col border border-[#E1DFDD] bg-white">
        <header className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#005A9E]">
              <Bot className="h-4 w-4" />
              AI 设置
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[#242424]">AI 服务商管理</h2>
            <p className="mt-1 text-sm text-[#605E5C]">配置大模型服务接入，密钥加密存储；同租户仅一个服务商可启用。</p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)} className={fluentButton('primary')}>
            <Plus className="h-4 w-4" />
            新增服务商
          </button>
        </header>

        <div className="fluent-scrollbar min-h-0 flex-1 overflow-auto">
          {loading && <div className="px-4 py-8 text-center text-sm text-[#605E5C]">加载中...</div>}
          {error && (
            <div className="m-4 border border-[#F1C6CA] bg-[#FDE7E9] px-4 py-3 text-sm font-semibold text-[#A4262C]">
              加载失败: {error}
              <button type="button" onClick={() => void reload()} className="ml-2 inline-flex items-center gap-1 underline">
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
            </div>
          )}
          {!loading && !error && providers.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[#605E5C]">暂无 AI 服务商，点击右上角新增。</div>
          )}
          {!loading && !error && providers.length > 0 && (
            <table className={`${fluentTable.table} min-w-[980px]`}>
              <thead className={fluentTable.thead}>
                <tr>
                  <th className={fluentTable.th}>名称</th>
                  <th className={fluentTable.th}>Base URL</th>
                  <th className={fluentTable.th}>文本模型</th>
                  <th className={fluentTable.th}>视觉模型</th>
                  <th className={fluentTable.th}>密钥</th>
                  <th className={fluentTable.th}>启用</th>
                  <th className={`${fluentTable.th} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id} className={fluentTable.row}>
                    <td className={fluentTable.td}>
                      <div className="font-semibold text-[#242424]">{provider.name}</div>
                    </td>
                    <td className={`${fluentTable.td} max-w-[240px] truncate font-mono text-xs text-[#605E5C]`} title={provider.baseUrl}>{provider.baseUrl}</td>
                    <td className={`${fluentTable.td} font-mono text-xs text-[#605E5C]`}>{provider.textModel}</td>
                    <td className={`${fluentTable.td} font-mono text-xs text-[#605E5C]`}>{provider.visionModel ?? '-'}</td>
                    <td className={`${fluentTable.td} font-mono text-xs text-[#605E5C]`}>{provider.apiKeyMasked}</td>
                    <td className={fluentTable.td}>
                      <button
                        type="button"
                        onClick={() => void onToggle(provider)}
                        aria-label={`${provider.enabled ? '停用' : '启用'} ${provider.name}`}
                        aria-pressed={provider.enabled}
                        className={fluentButton('secondary')}
                      >
                        {provider.enabled ? '已启用' : '已禁用'}
                      </button>
                    </td>
                    <td className={`${fluentTable.td} text-right`}>
                      <div className="inline-flex items-center justify-end gap-2">
                        {testResultLabel(testResults[provider.id])}
                        <button
                          type="button"
                          onClick={() => setEditing(provider)}
                          aria-label={`编辑 ${provider.name}`}
                          className={fluentButton('subtle')}
                        >
                          <Pencil className="h-4 w-4" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => void onTest(provider.id)}
                          disabled={testResults[provider.id] === 'loading'}
                          aria-label={`测试 ${provider.name}`}
                          className={fluentButton('secondary')}
                        >
                          <Zap className="h-4 w-4" />
                          测试
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(provider.id)}
                          aria-label={`删除 ${provider.name}`}
                          className={fluentButton('danger')}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

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
