import { BookOpen, Camera, Database, Images, Lightbulb, type LucideIcon } from 'lucide-react';
import type { AiTaskId } from './AiAssistant.model';

export const AI_TASKS: Array<{ id: AiTaskId; label: string; icon: LucideIcon }> = [
  { id: 'knowledge', label: '知识问答', icon: BookOpen },
  { id: 'vision', label: '视觉诊断', icon: Camera },
  { id: 'data', label: '数据问答', icon: Database },
  { id: 'advice', label: '农事建议', icon: Lightbulb },
  { id: 'batch', label: '批次诊断', icon: Images },
];

export function aiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AiResultBlock({ result, className = 'mt-4' }: { result: string; className?: string }) {
  return (
    <div className={`${className} whitespace-pre-wrap border border-[#E1DFDD] bg-[#F5F9FF] p-4 text-sm leading-6 text-[#242424]`}>
      {result}
    </div>
  );
}
