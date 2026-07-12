import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Loader2, Send, Sparkles } from 'lucide-react';
import AntiFakeMonitor from '../AntiFakeMonitor';
import { recentTraces } from './demo-data';
import type { DemoPanelProps } from './demo-types';

interface Task { id: string; title: string; desc: string; status: 'todo' | 'done' }

export function DemoOperationsPanel({ presentationMode }: DemoPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([{ id: '1', title: 'C区介壳虫防治喷药', desc: '演示任务：重点巡查叶背。', status: 'todo' }]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    const sync = (event: Event) => {
      const batchId = (event as CustomEvent<{ batchId?: string }>).detail?.batchId;
      if (batchId) setTasks(previous => [{ id: `record-${batchId}-${Date.now()}`, title: `同步批次 ${batchId}`, desc: '演示：根据农事记录生成作业提醒。', status: 'todo' }, ...previous]);
    };
    window.addEventListener('farm-record-added', sync);
    return () => window.removeEventListener('farm-record-added', sync);
  }, []);

  const ask = () => {
    if (!question.trim()) return;
    setAnswering(true); setAnswer(null);
    window.setTimeout(() => {
      setAnswer('【AI 示例】根据演示批次与天气样例，建议先检查土壤含水率，再决定是否追加高钾复合肥。本结果不是生产建议。');
      setAnswering(false);
    }, 400);
  };

  return <section className={`h-full overflow-auto rounded-xl border border-slate-200 bg-white p-4 ${presentationMode ? 'text-base' : ''}`}>
    <div className="drag-handle mb-4 cursor-move font-bold text-slate-800">演示运营协同</div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><h4 className="mb-3 text-sm font-bold">演示农事任务</h4>{tasks.map(task => <div key={task.id} className="mb-2 rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between text-sm font-bold"><span>{task.title}</span><button onClick={() => setTasks(previous => previous.map(item => item.id === task.id ? { ...item, status: 'done' } : item))}>{task.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-[#107C10]" /> : '完成'}</button></div><p className="mt-1 text-xs text-slate-500">{task.desc}</p></div>)}</div>
      <div className="rounded-xl border border-purple-200 bg-purple-50 p-3"><h4 className="flex items-center gap-2 text-sm font-bold text-purple-900"><Sparkles className="h-4 w-4" />演示种植顾问 (AI 示例)</h4><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="输入演示问题" className="mt-3 h-20 w-full resize-none rounded-lg border border-purple-200 p-2 text-sm" /><button onClick={ask} disabled={answering || !question.trim()} className="mt-2 flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{answering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}提交演示问题</button><AnimatePresence>{answer && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-lg bg-white p-3 text-xs leading-5 text-slate-700">{answer}</motion.p>}</AnimatePresence></div>
    </div>
    <div className="mt-4 rounded-xl border border-slate-200 p-3"><h4 className="mb-3 text-sm font-bold">演示近期溯源路径</h4>{recentTraces.map(trace => <div key={trace.id} className="grid gap-1 border-b border-slate-100 py-2 text-xs last:border-0 sm:grid-cols-[90px_1fr_80px]"><b className="font-mono">{trace.id}</b><span>{trace.name} · {trace.path}</span><span className="text-slate-500">{trace.time}</span></div>)}</div>
    <div className="mt-4 rounded-xl border border-slate-200 p-3"><div className="mb-2 text-xs font-bold text-amber-700">以下监控组件连接真实受保护 API，与本页其余演示数据分区展示。</div><AntiFakeMonitor /></div>
  </section>;
}
