import { useState } from 'react';
import { History } from 'lucide-react';
import { fluentStatusTag } from '../ui/fluent';
import { EmptyState } from '../ui/state';
import type { AiHistoryEntry } from './AiAssistant.model';
import { AI_TASKS, AiResultBlock } from './AiAssistant.shared';

export default function AiHistoryPanel({ history }: { history: readonly AiHistoryEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = history.find(entry => entry.id === selectedId) ?? null;

  return (
    <section aria-label="本次会话历史" className="border border-[#E1DFDD] bg-white">
      <div className="flex items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#242424]"><History className="h-4 w-4 text-[#0078D4]" />本次会话历史</h2>
        <span className={fluentStatusTag('neutral')}>{history.length}/20</span>
      </div>
      {history.length === 0 ? (
        <EmptyState title="暂无保留结果" description="完成任一 AI 任务后，结果会保留在本次页面会话中。" className="p-6" />
      ) : (
        <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="max-h-72 overflow-y-auto border-b border-[#E1DFDD] lg:border-b-0 lg:border-r">
            {history.map(entry => (
              <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={`block w-full border-b border-[#EDEBE9] px-4 py-3 text-left hover:bg-[#F5F9FF] ${selectedId === entry.id ? 'bg-[#EFF6FC]' : 'bg-white'}`}>
                <span className="block text-xs font-semibold text-[#0078D4]">{AI_TASKS.find(task => task.id === entry.task)?.label}</span>
                <span className="mt-1 block truncate text-sm font-semibold text-[#242424]">{entry.title}</span>
                <span className="mt-1 block text-xs text-[#605E5C]">{new Date(entry.createdAt).toLocaleTimeString('zh-CN')}</span>
              </button>
            ))}
          </div>
          <div className="min-h-36 p-4">
            {selected ? <AiResultBlock result={selected.result} className="mt-0" /> : <EmptyState title="选择一条历史记录" description="在左侧选择任务记录后查看保留的完整结果。" />}
          </div>
        </div>
      )}
    </section>
  );
}
