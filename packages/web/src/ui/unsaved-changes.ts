import { confirmDialog } from '../hooks/useDialog';

let activeChecker: (() => boolean) | null = null;
let pendingConfirmation: Promise<boolean> | null = null;

export function registerUnsavedChangesGuard(check: () => boolean): () => void {
  activeChecker = check;
  return () => {
    if (activeChecker === check) activeChecker = null;
  };
}

export async function confirmUnsavedNavigation(): Promise<boolean> {
  if (pendingConfirmation) return pendingConfirmation;
  if (!activeChecker?.()) return true;
  pendingConfirmation = confirmDialog({
    title: '放弃未保存更改',
    message: '当前页面有未保存更改。离开后这些更改将丢失。',
    confirmLabel: '放弃更改',
    cancelLabel: '继续编辑',
    tone: 'danger',
  });
  try {
    return await pendingConfirmation;
  } finally {
    pendingConfirmation = null;
  }
}
