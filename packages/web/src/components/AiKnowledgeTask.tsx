import { useState } from 'react';
import { BookOpen, Loader2, Sparkles } from 'lucide-react';
import { aiChat } from '../api/ai';
import { fluentButton, fluentInput } from '../ui/fluent';
import { ErrorState } from '../ui/state';
import { aiErrorMessage, AiResultBlock } from './AiAssistant.shared';

export default function AiKnowledgeTask({ onResult }: { onResult(title: string, result: string): void }) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAsk() {
    const question = query.trim();
    if (!question) return;
    setLoading(true);
    setError('');
    try {
      const response = await aiChat(question);
      setAnswer(response.answer);
      onResult(question, response.answer);
    } catch (caught) {
      setError(aiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-[#E1DFDD] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[#242424]">
        <BookOpen className="h-5 w-5 text-[#0078D4]" />
        <h2 className="font-semibold">AI 知识问答</h2>
      </div>
      <p className="mb-3 text-sm text-[#605E5C]">输入作物病虫害、栽培或用药问题，获取真实服务返回的解答。</p>
      <textarea value={query} onChange={event => setQuery(event.target.value)} rows={3} placeholder="例如：叶片出现褐色斑点，如何防治？" className={`${fluentInput} h-auto min-h-24 w-full resize-none py-2`} />
      <button type="button" onClick={() => void handleAsk()} disabled={loading || !query.trim()} className={`${fluentButton('primary')} mt-3`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? '思考中...' : '提问'}
      </button>
      {error && <ErrorState message={error} retryLabel="关闭" onRetry={() => setError('')} className="mt-3" />}
      {answer && <AiResultBlock result={answer} />}
    </section>
  );
}
