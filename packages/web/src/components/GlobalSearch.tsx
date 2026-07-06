import { useMemo, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppTab } from '../navigation';
import { fluentInput } from '../ui/fluent';

export interface GlobalSearchItem {
  id: AppTab;
  label: string;
  icon: LucideIcon;
}

interface GlobalSearchProps {
  items: GlobalSearchItem[];
  onOpen: (id: AppTab) => void;
}

export default function GlobalSearch({ items, onOpen }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return items
      .filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [items, normalizedQuery]);

  const openItem = (id: AppTab) => {
    onOpen(id);
    setQuery('');
  };

  return (
    <div className="relative hidden w-full max-w-xl sm:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
      <input
        className={`${fluentInput} w-full pl-8`}
        placeholder="搜索资源、菜单和功能"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setQuery('');
          }
          if (event.key === 'Enter' && results[0]) {
            event.preventDefault();
            openItem(results[0].id);
          }
        }}
      />
      {normalizedQuery && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[6px] border border-[#D1D1D1] bg-white shadow-lg">
          <div className="border-b border-[#EDEBE9] px-3 py-2 text-[11px] font-semibold text-[#605E5C]">
            菜单结果
          </div>
          {results.length ? (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`打开 ${item.label}`}
                    onClick={() => openItem(item.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[#323130] hover:bg-[#F3F2F1]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#0078D4]" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#8A8886]" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-[#605E5C]">没有匹配菜单</div>
          )}
        </div>
      )}
    </div>
  );
}
