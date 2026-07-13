import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AiProviderView } from '@nongchang/shared';
import { aiDiagnose } from '../api/ai';
import { listAiProviders } from '../api/ai-provider';
import { getBillingSummary } from '../api/billing';
import { uploadImage } from '../api/uploads';
import { useApi } from '../hooks/useApi';
import type { SystemRole } from '../navigation';
import { fluentStatusTag } from '../ui/fluent';
import AiAdviceTask from './AiAdviceTask';
import AiBatchDiagnosisSection from './AiBatchDiagnosisSection';
import AiDataQa from './AiDataQa';
import AiHistoryPanel from './AiHistoryPanel';
import AiKnowledgeTask from './AiKnowledgeTask';
import { AI_TASKS, aiErrorMessage } from './AiAssistant.shared';
import AiVisionTask from './AiVisionTask';
import {
  appendAiHistory,
  type AiHistoryEntry,
  type AiTaskId,
  type AiWorkspaceContext,
} from './AiAssistant.model';

const unreadableProviders = async (): Promise<AiProviderView[]> => [];

function initialTask(context?: AiWorkspaceContext): AiTaskId {
  if (context?.task) return context.task;
  if (context?.batchId) return 'batch';
  if (context?.fieldId) return 'advice';
  return 'knowledge';
}

export interface AiAssistantProps {
  role: SystemRole;
  context?: AiWorkspaceContext;
}

export default function AiAssistant({ role, context }: AiAssistantProps) {
  const [activeTask, setActiveTask] = useState<AiTaskId>(() => initialTask(context));
  const [history, setHistory] = useState<AiHistoryEntry[]>([]);
  const requestedTask = initialTask(context);

  const billing = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
  const providerReadable = role === 'system_admin';
  const providers = useApi(
    providerReadable ? listAiProviders : unreadableProviders,
    providerReadable ? { cacheKey: 'ai-providers' } : undefined,
  );

  const providerStatus = !providerReadable
    ? '执行时验证'
    : providers.loading
      ? '读取中'
      : providers.error
        ? '读取失败'
      : providers.data?.some(provider => provider.enabled)
        ? '已配置'
        : '未配置';

  useEffect(() => {
    setActiveTask(requestedTask);
  }, [requestedTask]);

  const recordHistory = (task: AiTaskId, title: string, result: string) => {
    const now = new Date();
    setHistory(previous => appendAiHistory(previous, {
      id: `${task}-${now.getTime()}-${previous.length}`,
      task,
      title,
      result,
      createdAt: now.toISOString(),
    }));
  };

  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<{ name: string; result: string }[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchErr, setBatchErr] = useState('');

  async function handleBatchDiagnose() {
    if (batchFiles.length === 0) return;
    setBatchRunning(true);
    setBatchErr('');
    setBatchResults([]);
    const completed: { name: string; result: string }[] = [];
    let successfulCount = 0;
    try {
      for (const file of batchFiles) {
        try {
          const upload = await uploadImage(file, 'ai-diagnose');
          const response = await aiDiagnose({ imageUrl: upload.url });
          completed.push({ name: file.name, result: response.result });
          successfulCount += 1;
          setBatchResults([...completed]);
          recordHistory('batch', file.name, response.result);
        } catch (error) {
          const message = aiErrorMessage(error);
          if (message.includes('额度不足')) {
            setBatchErr(`已诊断 ${successfulCount} 张，额度不足`);
            if (successfulCount > 0) void billing.reload();
            return;
          }
          completed.push({ name: file.name, result: `诊断失败：${message}` });
          setBatchResults([...completed]);
        }
      }
      if (successfulCount > 0) void billing.reload();
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border border-[#E1DFDD] bg-white p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-[#E5F1FB] text-[#0078D4]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#242424]">AI 任务工作台</h1>
            <p className="text-sm text-[#605E5C]">按任务保留本次会话结果，并使用真实接口执行问答与诊断。</p>
          </div>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p className="border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 font-semibold text-[#242424]">
            服务状态 {providerStatus}
          </p>
          <p className="border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 font-semibold text-[#242424]">
            AI 额度 {billing.data?.aiBalance ?? '暂不可用'}
          </p>
        </div>
      </header>

      <section className="border border-[#E1DFDD] bg-[#FFF9E6] px-4 py-3 text-xs leading-5 text-[#605E5C]">
        成功调用后由后端按实际规则扣减 AI 额度；上传的图片会进入当前租户配置的对象存储，并交由执行时选中的 AI 服务处理。
      </section>

      {(context?.batchId || context?.fieldId) && (
        <section className="flex flex-wrap items-center gap-2 border border-[#B4D6F4] bg-[#F5F9FF] px-4 py-3 text-sm text-[#005A9E]">
          <span className={fluentStatusTag('active')}>业务上下文</span>
          {context.batchId && <span>当前批次上下文 {context.batchId}</span>}
          {context.fieldId && <span>当前地块上下文 {context.fieldId}</span>}
        </section>
      )}

      <div className="border border-[#E1DFDD] bg-white">
        <div role="tablist" aria-label="AI 任务" className="fluent-scrollbar flex overflow-x-auto border-b border-[#E1DFDD] bg-[#FAFAFA] p-1">
          {AI_TASKS.map(task => {
            const Icon = task.icon;
            const selected = activeTask === task.id;
            return (
              <button
                key={task.id}
                id={`ai-tab-${task.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`ai-panel-${task.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTask(task.id)}
                className={`inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${selected
                  ? 'border-b-[#0078D4] bg-white text-[#005A9E]'
                  : 'border-b-transparent text-[#605E5C] hover:bg-[#F3F2F1] hover:text-[#242424]'}`}
              >
                <Icon className="h-4 w-4" />
                {task.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-5">
          <div id="ai-panel-knowledge" role="tabpanel" aria-labelledby="ai-tab-knowledge" hidden={activeTask !== 'knowledge'}>
            <AiKnowledgeTask onResult={(title, result) => { recordHistory('knowledge', title, result); void billing.reload(); }} />
          </div>

          <div id="ai-panel-vision" role="tabpanel" aria-labelledby="ai-tab-vision" hidden={activeTask !== 'vision'}>
            <AiVisionTask onResult={(title, result) => { recordHistory('vision', title, result); void billing.reload(); }} />
          </div>

          <div id="ai-panel-data" role="tabpanel" aria-labelledby="ai-tab-data" hidden={activeTask !== 'data'}>
            <AiDataQa
              onResult={(question, dataAnswer) => {
                recordHistory('data', question, dataAnswer);
                void billing.reload();
              }}
            />
          </div>

          <div id="ai-panel-advice" role="tabpanel" aria-labelledby="ai-tab-advice" hidden={activeTask !== 'advice'}>
            <AiAdviceTask context={context} onResult={(title, result) => { recordHistory('advice', title, result); void billing.reload(); }} />
          </div>

          <div id="ai-panel-batch" role="tabpanel" aria-labelledby="ai-tab-batch" hidden={activeTask !== 'batch'}>
            <AiBatchDiagnosisSection
              files={batchFiles}
              running={batchRunning}
              error={batchErr}
              results={batchResults}
              onFilesChange={setBatchFiles}
              onRun={() => void handleBatchDiagnose()}
              onClearError={() => setBatchErr('')}
            />
          </div>
        </div>
      </div>

      <AiHistoryPanel history={history} />
    </div>
  );
}
