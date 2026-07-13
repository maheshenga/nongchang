import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type ReactPortal,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { fluentButton } from './fluent';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalSurfaceProps {
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  maxWidthClassName?: string;
  initialFocusSelector?: string;
  tone?: 'default' | 'danger';
}

export function ModalSurface({
  title,
  description,
  onClose,
  children,
  footer,
  closeDisabled = false,
  maxWidthClassName = 'max-w-lg',
  initialFocusSelector,
  tone = 'default',
}: ModalSurfaceProps): ReactPortal {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTarget = (initialFocusSelector
      ? panelRef.current?.querySelector<HTMLElement>(initialFocusSelector)
      : null)
      ?? contentRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ?? footerRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ?? panelRef.current;
    focusTarget?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [initialFocusSelector]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!closeDisabled) onClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      data-modal-layer="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
    >
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black/40"
        onMouseDown={() => {
          if (!closeDisabled) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative z-[1] max-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl ${maxWidthClassName}`}
      >
        <header className="flex min-h-12 items-start justify-between gap-4 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-3">
          <div>
            <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-[#242424]">
              {tone === 'danger' && <AlertTriangle className="h-5 w-5 text-[#A4262C]" />}
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 whitespace-pre-wrap text-sm text-[#605E5C]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={closeDisabled}
            onClick={onClose}
            className={fluentButton('icon')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div
          ref={contentRef}
          className="fluent-scrollbar max-h-[calc(100vh-10rem)] overflow-y-auto"
        >
          {children}
        </div>
        {footer && (
          <footer
            ref={footerRef}
            className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4"
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
