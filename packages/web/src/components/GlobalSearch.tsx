import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppTab } from '../navigation';
import { fluentInput } from '../ui/fluent';

export interface GlobalSearchItem {
  id: AppTab;
  label: string;
  icon: LucideIcon;
}

export interface GlobalSearchProps {
  items: GlobalSearchItem[];
  onOpen: (id: AppTab) => void;
  className?: string;
  idPrefix?: string;
  enableShortcut?: boolean;
}

export default function GlobalSearch({
  items,
  onOpen,
  className = 'hidden sm:block',
  idPrefix = 'global-search',
  enableShortcut = true,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const normalizedQuery = query.trim().toLowerCase();
  const listboxId = `${idPrefix}-listbox`;
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return items
      .filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [items, normalizedQuery]);

  const openItem = (id: AppTab) => {
    onOpen(id);
    setQuery('');
    setActiveIndex(-1);
  };

  useEffect(() => {
    if (!enableShortcut) return undefined;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [enableShortcut]);

  useEffect(() => {
    const activeOption = optionRefs.current.get(activeIndex);
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className={`relative w-full max-w-xl ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
      <input
        ref={inputRef}
        id={`${idPrefix}-input`}
        role="combobox"
        aria-label="全局搜索"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={results.length > 0}
        aria-activedescendant={activeIndex >= 0 && results[activeIndex] ? `${idPrefix}-option-${results[activeIndex].id}` : undefined}
        className={`${fluentInput} w-full pl-8`}
        placeholder="搜索资源、菜单和功能"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setQuery('');
            setActiveIndex(-1);
            return;
          }
          if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            setActiveIndex(index => Math.min(index + 1, results.length - 1));
            return;
          }
          if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault();
            setActiveIndex(index => Math.max(0, index - 1));
            return;
          }
          if (event.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
            event.preventDefault();
            openItem(results[activeIndex].id);
          }
        }}
      />
      {normalizedQuery && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[6px] border border-[#D1D1D1] bg-white shadow-lg">
          <div className="border-b border-[#EDEBE9] px-3 py-2 text-[11px] font-semibold text-[#605E5C]">
            菜单结果
          </div>
          {results.length ? (
            <div id={listboxId} role="listbox" aria-label="菜单结果" className="max-h-80 overflow-y-auto py-1">
              {results.map((item, index) => {
                const Icon = item.icon;
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    ref={(element) => {
                      if (element) optionRefs.current.set(index, element);
                      else optionRefs.current.delete(index);
                    }}
                    id={`${idPrefix}-option-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`打开 ${item.label}`}
                    onClick={() => openItem(item.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[#323130] ${active ? 'bg-[#EFF6FC]' : 'hover:bg-[#F3F2F1]'}`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#0078D4]" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#8A8886]" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="status" aria-live="polite" className="px-3 py-3 text-sm text-[#605E5C]">没有匹配菜单</div>
          )}
        </div>
      )}
    </div>
  );
}
