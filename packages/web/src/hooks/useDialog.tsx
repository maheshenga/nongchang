import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { fluentButton } from '../ui/fluent';

export interface DialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface AlertDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
}

type DialogRequest = {
  id: number;
  kind: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: 'default' | 'danger';
  resolveConfirm?: (value: boolean) => void;
  resolveAlert?: () => void;
};

let dialogSeq = 0;
let currentDialog: DialogRequest | null = null;
const dialogQueue: DialogRequest[] = [];
const listeners = new Set<(request: DialogRequest | null) => void>();

function notify(request: DialogRequest | null): void {
  currentDialog = request;
  listeners.forEach((listener) => listener(request));
}

function settleRequest(request: DialogRequest, confirmed: boolean): void {
  request.resolveConfirm?.(confirmed);
  if (request.kind === 'alert') request.resolveAlert?.();
}

function enqueueDialog(request: DialogRequest): void {
  if (currentDialog) {
    dialogQueue.push(request);
    return;
  }
  notify(request);
}

function settleCurrentDialog(requestId: number, confirmed: boolean): void {
  if (currentDialog?.id !== requestId) return;
  const settled = currentDialog;
  currentDialog = null;
  settleRequest(settled, confirmed);
  notify(dialogQueue.shift() ?? null);
}

function cancelAllDialogs(): void {
  const pending = [
    ...(currentDialog ? [currentDialog] : []),
    ...dialogQueue.splice(0),
  ];
  notify(null);
  pending.forEach((request) => settleRequest(request, false));
}

function normalizeConfirm(options: DialogOptions | string): DialogOptions {
  return typeof options === 'string' ? { message: options } : options;
}

function normalizeAlert(options: AlertDialogOptions | string): AlertDialogOptions {
  return typeof options === 'string' ? { message: options } : options;
}

export function confirmDialog(options: DialogOptions | string): Promise<boolean> {
  const normalized = normalizeConfirm(options);
  return new Promise((resolve) => {
    enqueueDialog({
      id: ++dialogSeq,
      kind: 'confirm',
      title: normalized.title ?? '确认操作',
      message: normalized.message,
      confirmLabel: normalized.confirmLabel ?? '确认',
      cancelLabel: normalized.cancelLabel ?? '取消',
      tone: normalized.tone ?? 'default',
      resolveConfirm: resolve,
    });
  });
}

export function alertDialog(options: AlertDialogOptions | string): Promise<void> {
  const normalized = normalizeAlert(options);
  return new Promise((resolve) => {
    enqueueDialog({
      id: ++dialogSeq,
      kind: 'alert',
      title: normalized.title ?? '提示',
      message: normalized.message,
      confirmLabel: normalized.confirmLabel ?? '知道了',
      cancelLabel: '取消',
      tone: normalized.tone ?? 'default',
      resolveAlert: resolve,
    });
  });
}

function useDialogState(): DialogRequest | null {
  const [request, setRequest] = useState<DialogRequest | null>(currentDialog);

  useEffect(() => {
    const listener = (next: DialogRequest | null) => setRequest(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) cancelAllDialogs();
    };
  }, []);

  return request;
}

export function DialogHost() {
  const request = useDialogState();
  if (!request) return null;

  const closeConfirm = (value: boolean) => {
    settleCurrentDialog(request.id, value);
  };

  const confirmVariant = request.tone === 'danger' ? 'danger' : 'primary';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dialog-title-${request.id}`}
        className="w-full max-w-md overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl"
      >
        <div className="flex min-h-12 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-3">
          <h2 id={`dialog-title-${request.id}`} className="flex items-center gap-2 text-base font-semibold text-[#242424]">
            {request.tone === 'danger' && <AlertTriangle className="h-5 w-5 text-[#A4262C]" />}
            {request.title}
          </h2>
          <button type="button" aria-label="关闭" onClick={() => closeConfirm(false)} className={fluentButton('icon')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5 text-sm leading-6 text-[#605E5C] whitespace-pre-wrap">
          {request.message}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
          {request.kind === 'confirm' && (
            <button type="button" onClick={() => closeConfirm(false)} className={fluentButton('secondary')}>
              {request.cancelLabel}
            </button>
          )}
          <button type="button" onClick={() => closeConfirm(true)} className={fluentButton(confirmVariant)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
