import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModalSurface } from './ModalSurface';

function Harness({
  onClose = vi.fn(),
  closeDisabled = false,
}: {
  onClose?: () => void;
  closeDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="feature-root">
      <button type="button" onClick={() => setOpen(true)}>打开者</button>
      {open && (
        <ModalSurface
          title="测试弹窗"
          description="弹窗描述"
          closeDisabled={closeDisabled}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={<button type="button">确认</button>}
        >
          <button type="button">第一个操作</button>
          <button type="button">最后一个操作</button>
        </ModalSurface>
      )}
    </div>
  );
}

describe('ModalSurface', () => {
  it('renders through a body portal and locks body scrolling', () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '打开者' }));

    const dialog = screen.getByRole('dialog', { name: '测试弹窗' });
    expect(view.container.contains(dialog)).toBe(false);
    expect(dialog.closest('[data-modal-layer="true"]')?.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('focuses the first control and traps Tab in both directions', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '打开者' }));

    const first = screen.getByRole('button', { name: '第一个操作' });
    const confirm = screen.getByRole('button', { name: '确认' });
    const close = screen.getByRole('button', { name: '关闭' });
    expect(document.activeElement).toBe(first);

    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('closes on Escape and restores focus to the opener', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: '打开者' });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('blocks Escape and backdrop closure while closeDisabled is true', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeDisabled />);
    fireEvent.click(screen.getByRole('button', { name: '打开者' }));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.mouseDown(screen.getByTestId('modal-backdrop'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
