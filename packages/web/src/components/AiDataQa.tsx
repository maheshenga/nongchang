import { useState } from 'react';
import { MessageSquareText, Loader2, Sparkles } from 'lucide-react';
import { aiAsk } from '../api/ai';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// AI 数据问答:基于当前用户可见的批次数据进行自然语言问答。
export default function AiDataQa() {
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
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-gray-900">
        <MessageSquareText className="h-5 w-5 text-blue-600" />
        <h2 className="font-semibold">AI 数据问答</h2>
      </div>
      <p className="mb-3 text-sm text-gray-500">用自然语言询问你的批次数据,AI 结合可见批次为你解答。</p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        placeholder="例如:我有哪些批次还在生长期?"
        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        onClick={handleAsk}
        disabled={loading || !question.trim()}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? '分析中…' : '提问'}
      </button>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {answer && (
        <div className="mt-4 whitespace-pre-wrap rounded-lg bg-blue-50 p-4 text-sm text-gray-800">{answer}</div>
      )}
    </section>
  );
}
