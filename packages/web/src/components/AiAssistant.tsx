import { useEffect, useState } from 'react';
import {
  BookOpen,
  Camera,
  Database,
  History,
  Images,
  Lightbulb,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { AiProviderView } from '@nongchang/shared';
import { aiAdvice, aiChat, aiDiagnose } from '../api/ai';
import { listAiProviders } from '../api/ai-provider';
import { listBatches, type Batch } from '../api/batches';
import { getBillingSummary } from '../api/billing';
import { uploadImage } from '../api/uploads';
import { useApi } from '../hooks/useApi';
import type { SystemRole } from '../navigation';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState } from '../ui/state';
import AiBatchDiagnosisSection from './AiBatchDiagnosisSection';
import AiDataQa from './AiDataQa';
import {
  appendAiHistory,
  type AiHistoryEntry,
  type AiTaskId,
  type AiWorkspaceContext,
} from './AiAssistant.model';

const TASKS: Array<{ id: AiTaskId; label: string; icon: typeof BookOpen }> = [
  { id: 'knowledge', label: '知识问答', icon: BookOpen },
  { id: 'vision', label: '视觉诊断', icon: Camera },
  { id: 'data', label: '数据问答', icon: Database },
  { id: 'advice', label: '农事建议', icon: Lightbulb },
  { id: 'batch', label: '批次诊断', icon: Images },
];

const unreadableProviders = async (): Promise<AiProviderView[]> => [];

function errMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

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
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

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
    setActiveTask(initialTask(context));
  }, [context?.batchId, context?.fieldId, context?.task]);

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

  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatErr, setChatErr] = useState('');

  async function handleAsk() {
    const question = query.trim();
    if (!question) return;
    setChatLoading(true);
    setChatErr('');
    try {
      const response = await aiChat(question);
      setAnswer(response.answer);
      recordHistory('knowledge', question, response.answer);
      void billing.reload();
    } catch (error) {
      setChatErr(errMsg(error));
    } finally {
      setChatLoading(false);
    }
  }

  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState('');
  const [uploading, setUploading] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState('');

  async function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDiagErr('');
    setImageUrl('');
    try {
      const response = await uploadImage(file, 'ai-diagnose');
      setImageUrl(response.url);
      setImageName(file.name);
    } catch (error) {
      setDiagErr(errMsg(error));
    } finally {
      setUploading(false);
    }
  }

  async function handleDiagnose() {
    if (!imageUrl) return;
    setDiagLoading(true);
    setDiagErr('');
    try {
      const response = await aiDiagnose({ imageUrl, note: note.trim() || undefined });
      setResult(response.result);
      recordHistory('vision', imageName || '单图诊断', response.result);
      void billing.reload();
    } catch (error) {
      setDiagErr(errMsg(error));
    } finally {
      setDiagLoading(false);
    }
  }

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
          const message = errMsg(error);
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

  const [batches, setBatches] = useState<Batch[]>([]);
  const [adviceBatchId, setAdviceBatchId] = useState(context?.batchId ?? '');
  const [advice, setAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceErr, setAdviceErr] = useState('');

  useEffect(() => {
    listBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    if (context?.batchId) setAdviceBatchId(context.batchId);
  }, [context?.batchId]);

  async function handleAdvice() {
    if (!adviceBatchId) return;
    setAdviceLoading(true);
    setAdviceErr('');
    try {
      const response = await aiAdvice({ batchId: adviceBatchId });
      setAdvice(response.answer);
      const selectedBatch = batches.find(batch => batch.id === adviceBatchId);
      recordHistory('advice', selectedBatch?.batchNo ?? adviceBatchId, response.answer);
      void billing.reload();
    } catch (error) {
      setAdviceErr(errMsg(error));
    } finally {
      setAdviceLoading(false);
    }
  }

  const selectedHistory = history.find(entry => entry.id === selectedHistoryId) ?? null;

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
          {TASKS.map(task => {
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
            <section className="border border-[#E1DFDD] bg-white p-5">
              <div className="mb-4 flex items-center gap-2 text-[#242424]">
                <BookOpen className="h-5 w-5 text-[#0078D4]" />
                <h2 className="font-semibold">AI 知识问答</h2>
              </div>
              <p className="mb-3 text-sm text-[#605E5C]">输入作物病虫害、栽培或用药问题，获取真实服务返回的解答。</p>
              <textarea
                value={query}
                onChange={event => setQuery(event.target.value)}
                rows={3}
                placeholder="例如：叶片出现褐色斑点，如何防治？"
                className={`${fluentInput} h-auto min-h-24 w-full resize-none py-2`}
              />
              <button type="button" onClick={() => void handleAsk()} disabled={chatLoading || !query.trim()} className={`${fluentButton('primary')} mt-3`}>
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {chatLoading ? '思考中...' : '提问'}
              </button>
              {chatErr && <ErrorState message={chatErr} retryLabel="关闭" onRetry={() => setChatErr('')} className="mt-3" />}
              {answer && <ResultBlock result={answer} />}
            </section>
          </div>

          <div id="ai-panel-vision" role="tabpanel" aria-labelledby="ai-tab-vision" hidden={activeTask !== 'vision'}>
            <section className="border border-[#E1DFDD] bg-white p-5">
              <div className="mb-4 flex items-center gap-2 text-[#242424]">
                <Camera className="h-5 w-5 text-[#0078D4]" />
                <h2 className="font-semibold">AI 视觉诊断</h2>
              </div>
              <p className="mb-3 text-sm text-[#605E5C]">上传作物照片，使用真实视觉模型识别问题并返回处理建议。</p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[#C8C6C4] bg-[#FAFAFA] px-4 py-6 text-sm text-[#605E5C] hover:border-[#0078D4]">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin text-[#0078D4]" /> : <Upload className="h-6 w-6 text-[#8A8886]" />}
                <span>{uploading ? '上传中...' : imageName || '点击选择图片（≤5MB）'}</span>
                <input
                  aria-label="选择诊断图片"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onPickImage}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {imageUrl && <img src={imageUrl} alt={imageName} className="mt-3 max-h-48 w-full object-contain" />}
              <input value={note} onChange={event => setNote(event.target.value)} placeholder="补充说明（可选）" className={`${fluentInput} mt-3 w-full`} />
              <button type="button" onClick={() => void handleDiagnose()} disabled={diagLoading || !imageUrl} className={`${fluentButton('primary')} mt-3`}>
                {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {diagLoading ? '诊断中...' : '开始诊断'}
              </button>
              {diagErr && <ErrorState message={diagErr} retryLabel="关闭" onRetry={() => setDiagErr('')} className="mt-3" />}
              {result && <ResultBlock result={result} />}
            </section>
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
            <section className="border border-[#E1DFDD] bg-white p-5">
              <div className="mb-4 flex items-center gap-2 text-[#242424]">
                <Lightbulb className="h-5 w-5 text-[#0078D4]" />
                <h2 className="font-semibold">AI 农事建议</h2>
              </div>
              <p className="mb-3 text-sm text-[#605E5C]">选择批次，AI 结合该批次物候与近期农事返回未来一周建议。</p>
              {context?.fieldId && !context.batchId && (
                <p className="mb-3 border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 text-xs text-[#605E5C]">
                  已带入地块上下文；当前建议接口仍需选择该地块下的具体批次。
                </p>
              )}
              <select aria-label="选择建议批次" value={adviceBatchId} onChange={event => setAdviceBatchId(event.target.value)} className={`${fluentSelect} w-full`}>
                <option value="">请选择批次</option>
                {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.batchNo} · {batch.cropName}</option>)}
              </select>
              {batches.length === 0 && <EmptyState title="暂无可选批次" description="创建批次后即可生成真实 AI 农事建议。" className="mt-3 border border-[#E1DFDD]" />}
              <button type="button" onClick={() => void handleAdvice()} disabled={adviceLoading || !adviceBatchId} className={`${fluentButton('primary')} mt-3`}>
                {adviceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                {adviceLoading ? '生成中...' : '获取 AI 农事建议'}
              </button>
              {adviceErr && <ErrorState message={adviceErr} retryLabel="关闭" onRetry={() => setAdviceErr('')} className="mt-3" />}
              {advice && <ResultBlock result={advice} />}
            </section>
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

      <section aria-label="本次会话历史" className="border border-[#E1DFDD] bg-white">
        <div className="flex items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
            <History className="h-4 w-4 text-[#0078D4]" />
            本次会话历史
          </h2>
          <span className={fluentStatusTag('neutral')}>{history.length}/20</span>
        </div>
        {history.length === 0 ? (
          <EmptyState title="暂无保留结果" description="完成任一 AI 任务后，结果会保留在本次页面会话中。" className="p-6" />
        ) : (
          <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="max-h-72 overflow-y-auto border-b border-[#E1DFDD] lg:border-b-0 lg:border-r">
              {history.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedHistoryId(entry.id)}
                  className={`block w-full border-b border-[#EDEBE9] px-4 py-3 text-left hover:bg-[#F5F9FF] ${selectedHistoryId === entry.id ? 'bg-[#EFF6FC]' : 'bg-white'}`}
                >
                  <span className="block text-xs font-semibold text-[#0078D4]">{TASKS.find(task => task.id === entry.task)?.label}</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-[#242424]">{entry.title}</span>
                  <span className="mt-1 block text-xs text-[#605E5C]">{new Date(entry.createdAt).toLocaleTimeString('zh-CN')}</span>
                </button>
              ))}
            </div>
            <div className="min-h-36 p-4">
              {selectedHistory
                ? <ResultBlock result={selectedHistory.result} className="mt-0" />
                : <EmptyState title="选择一条历史记录" description="在左侧选择任务记录后查看保留的完整结果。" />}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ResultBlock({ result, className = 'mt-4' }: { result: string; className?: string }) {
  return (
    <div className={`${className} whitespace-pre-wrap border border-[#E1DFDD] bg-[#F5F9FF] p-4 text-sm leading-6 text-[#242424]`}>
      {result}
    </div>
  );
}
