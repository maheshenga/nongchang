import { useEffect, useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { aiAdvice } from '../api/ai';
import { listBatches, type Batch } from '../api/batches';
import { fluentButton, fluentSelect } from '../ui/fluent';
import { EmptyState, ErrorState } from '../ui/state';
import { aiErrorMessage, AiResultBlock } from './AiAssistant.shared';
import type { AiWorkspaceContext } from './AiAssistant.model';

interface AiAdviceTaskProps {
  context?: AiWorkspaceContext;
  onResult(title: string, result: string): void;
}

export default function AiAdviceTask({ context, onResult }: AiAdviceTaskProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState(context?.batchId ?? '');
  const [advice, setAdvice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    if (context?.batchId) setBatchId(context.batchId);
  }, [context?.batchId]);

  async function handleAdvice() {
    if (!batchId) return;
    setLoading(true);
    setError('');
    try {
      const response = await aiAdvice({ batchId });
      setAdvice(response.answer);
      onResult(batches.find(batch => batch.id === batchId)?.batchNo ?? batchId, response.answer);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-[#E1DFDD] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[#242424]">
        <Lightbulb className="h-5 w-5 text-[#0078D4]" />
        <h2 className="font-semibold">AI 农事建议</h2>
      </div>
      <p className="mb-3 text-sm text-[#605E5C]">选择批次，AI 结合该批次物候与近期农事返回未来一周建议。</p>
      {context?.fieldId && !context.batchId && <p className="mb-3 border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 text-xs text-[#605E5C]">已带入地块上下文；当前建议接口仍需选择该地块下的具体批次。</p>}
      <select aria-label="选择建议批次" value={batchId} onChange={event => setBatchId(event.target.value)} className={`${fluentSelect} w-full`}>
        <option value="">请选择批次</option>
        {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.batchNo} · {batch.cropName}</option>)}
      </select>
      {batches.length === 0 && <EmptyState title="暂无可选批次" description="创建批次后即可生成真实 AI 农事建议。" className="mt-3 border border-[#E1DFDD]" />}
      <button type="button" onClick={() => void handleAdvice()} disabled={loading || !batchId} className={`${fluentButton('primary')} mt-3`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
        {loading ? '生成中...' : '获取 AI 农事建议'}
      </button>
      {error && <ErrorState message={error} retryLabel="关闭" onRetry={() => setError('')} className="mt-3" />}
      {advice && <AiResultBlock result={advice} />}
    </section>
  );
}
