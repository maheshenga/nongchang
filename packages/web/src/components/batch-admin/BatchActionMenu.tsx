import {
  Calculator,
  FileText,
  Loader2,
  MoreHorizontal,
  ScanLine,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { fluentButton } from '../../ui/fluent';
import type { ViewBatch } from '../BatchAdmin.model';

export interface BatchActionCallbacks {
  onCodes(id: string): void;
  onCompliance(id: string): void;
  onCredentials(batch: ViewBatch): void;
  onProfit(id: string): void;
  onReport(id: string): void;
  onDelete(batch: ViewBatch): void;
}

interface BatchActionMenuProps extends BatchActionCallbacks {
  batch: ViewBatch;
  open: boolean;
  exportingReportId: string | null;
  scanningCompliance: boolean;
  onOpenChange(batchId: string | null): void;
}

export function BatchActionMenu({
  batch,
  open,
  onOpenChange,
  exportingReportId,
  scanningCompliance,
  ...actions
}: BatchActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onOpenChange(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onOpenChange]);

  const run = (action: () => void) => {
    action();
    onOpenChange(null);
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(null);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown' && items.length > 0) {
      event.preventDefault();
      items[(index + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp' && items.length > 0) {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    }
  };

  const itemClass = 'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F3F2F1] focus-visible:outline-none focus-visible:bg-[#EFF6FC] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`批次 ${batch.code} 更多操作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(open ? null : batch.id)}
        className={fluentButton('secondary')}
      >
        <MoreHorizontal className="h-4 w-4" />更多操作
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`批次 ${batch.code} 操作`}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 w-44 border border-[#E1DFDD] bg-white shadow-lg"
        >
          <button role="menuitem" type="button" className={itemClass} onClick={() => run(() => actions.onCodes(batch.id))}>
            <ScanLine className="h-4 w-4" />已生成码
          </button>
          <button role="menuitem" type="button" className={itemClass} onClick={() => run(() => actions.onCompliance(batch.id))}>
            {scanningCompliance ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}合规
          </button>
          <button role="menuitem" type="button" className={itemClass} onClick={() => run(() => actions.onCredentials(batch))}>
            <ShieldCheck className="h-4 w-4" />资质
          </button>
          <button role="menuitem" type="button" className={itemClass} onClick={() => run(() => actions.onProfit(batch.id))}>
            <Calculator className="h-4 w-4" />利润
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={exportingReportId === batch.id}
            className={itemClass}
            onClick={() => run(() => actions.onReport(batch.id))}
          >
            <FileText className="h-4 w-4" />报告
          </button>
          <button
            role="menuitem"
            type="button"
            className={`${itemClass} text-[#A4262C]`}
            onClick={() => run(() => actions.onDelete(batch))}
          >
            <Trash2 className="h-4 w-4" />删除
          </button>
        </div>
      )}
    </div>
  );
}
