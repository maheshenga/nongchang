import { useState } from 'react';
import { MessageSquareText, Loader2, Sparkles } from 'lucide-react';
import { aiAsk } from '../api/ai';
import { fluentButton, fluentInput } from '../ui/fluent';
import { ErrorState } from '../ui/state';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// AI 数据问答:基于当前用户可见的批次数据进行自然语言问答。
export default function AiDataQa({ onResult }: { onResult?: (question: string, answer: string) => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleAsk() {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setErr('');
    setAnswer('');
    try {
      const res = await aiAsk({ question: q });
      setAnswer(res.answer);
      onResult?.(q, res.answer);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-[#E1DFDD] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[#242424]">
        <MessageSquareText className="h-5 w-5 text-[#0078D4]" />
        <h2 className="font-semibold">AI 数据问答</h2>
      </div>
      <p className="mb-3 text-sm text-[#605E5C]">用自然语言询问你的批次数据，AI 结合可见批次为你解答。</p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        placeholder="例如：我有哪些批次还在生长期？"
        className={`${fluentInput} h-auto min-h-24 w-full resize-none py-2`}
      />
      <button
        type="button"
        onClick={handleAsk}
        disabled={loading || !question.trim()}
        className={`${fluentButton('primary')} mt-3`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? '查询中...' : '查询数据'}
      </button>
      {err && <ErrorState message={err} retryLabel="关闭" onRetry={() => setErr('')} className="mt-3" />}
      {answer && (
        <div className="mt-4 whitespace-pre-wrap border border-[#E1DFDD] bg-[#F5F9FF] p-4 text-sm leading-6 text-[#242424]">
          {answer}
        </div>
      )}
    </section>
  );
}
