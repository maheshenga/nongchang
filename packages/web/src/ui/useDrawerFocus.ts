import { useCallback, useEffect, useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { trapTabKey } from './focus-trap';

export function useDrawerFocus(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const openDrawer = useCallback(() => setOpen(true), [setOpen]);
  const closeDrawer = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = true;
      closeButtonRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const onDialogKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
    } else {
      trapTabKey(event.currentTarget, event.nativeEvent);
    }
  }, [closeDrawer]);

  return { closeButtonRef, closeDrawer, onDialogKeyDown, openDrawer, triggerRef };
}
