import { Info } from 'lucide-react';

export default function DemoBadge({ note }: { note?: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">
      <Info className="w-3.5 h-3.5" />
      演示数据 / 待接入{note ? ` · ${note}` : ''}
    </div>
  );
}
