import type { Paginated } from '@nongchang/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fluentButton } from './fluent';

export const MANAGEMENT_PAGE_SIZE = 100;

export function normalizePage<T>(
  data: Paginated<T> | T[] | null | undefined,
  fallbackPage: number,
  fallbackPageSize = MANAGEMENT_PAGE_SIZE,
): Paginated<T> {
  if (!data) {
    return { items: [], total: 0, page: fallbackPage, pageSize: fallbackPageSize };
  }
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: fallbackPage, pageSize: fallbackPageSize };
  }
  return data;
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  className?: string;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  loading = false,
  className = '',
  onPageChange,
}: PaginationControlsProps) {
  const pages = totalPages(total, pageSize);
  const current = Math.min(Math.max(page, 1), pages);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3 text-sm text-[#605E5C] ${className}`}>
      <div className="font-semibold text-[#323130]">
        Page {current} / {pages}
        <span className="ml-2 font-normal text-[#605E5C]">{total} total</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={loading || current <= 1}
          onClick={() => onPageChange(current - 1)}
          className={fluentButton('secondary')}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={loading || current >= pages}
          onClick={() => onPageChange(current + 1)}
          className={fluentButton('secondary')}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
