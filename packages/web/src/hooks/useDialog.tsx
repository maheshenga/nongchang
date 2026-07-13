import { useEffect, useState } from 'react';
import { fluentButton } from '../ui/fluent';
import { ModalSurface } from '../ui/ModalSurface';

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
const listeners = new Set<(request: DialogRequest | null) => void>();

function notify(request: DialogRequest | null): void {
  currentDialog = request;
  listeners.forEach((listener) => listener(request));
}

function settleRequest(request: DialogRequest, confirmed: boolean): void {
  request.resolveConfirm?.(confirmed);
  if (request.kind === 'alert') request.resolveAlert?.();
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
    notify({
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
    notify({
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
      if (listeners.size === 0 && currentDialog) {
        const orphaned = currentDialog;
        notify(null);
        settleRequest(orphaned, false);
      }
    };
  }, []);

  return request;
}

export function DialogHost() {
  const request = useDialogState();
  if (!request) return null;

  const closeConfirm = (value: boolean) => {
    if (currentDialog?.id !== request.id) return;
    notify(null);
    settleRequest(request, value);
  };

  const confirmVariant = request.tone === 'danger' ? 'danger' : 'primary';

  return (
    <ModalSurface
      title={request.title}
      description={request.message}
      tone={request.tone === 'danger' ? 'danger' : 'default'}
      onClose={() => closeConfirm(false)}
      maxWidthClassName="max-w-md"
      footer={(
        <>
          {request.kind === 'confirm' && (
            <button type="button" onClick={() => closeConfirm(false)} className={fluentButton('secondary')}>
              {request.cancelLabel}
            </button>
          )}
          <button type="button" onClick={() => closeConfirm(true)} className={fluentButton(confirmVariant)}>
            {request.confirmLabel}
          </button>
        </>
      )}
    >
      <div className="sr-only" aria-hidden="true" />
    </ModalSurface>
  );
}
