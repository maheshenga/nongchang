import { afterEach, describe, expect, it } from 'vitest';
import { trapTabKey } from './focus-trap';

function makeDialog() {
  const dialog = document.createElement('div');
  dialog.tabIndex = -1;
  dialog.innerHTML = `
    <button type="button">First</button>
    <a href="#target">Middle</a>
    <button type="button">Last</button>
    <button type="button" disabled>Disabled</button>
  `;
  document.body.append(dialog);
  return dialog;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('trapTabKey', () => {
  it('wraps Tab from the last focusable element to the first', () => {
    const dialog = makeDialog();
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    buttons[1].focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    trapTabKey(dialog, event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('wraps Shift+Tab from the first focusable element to the last', () => {
    const dialog = makeDialog();
    const first = dialog.querySelector<HTMLButtonElement>('button')!;
    const last = dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')[1];
    first.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });

    trapTabKey(dialog, event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('leaves focus movement alone when it remains inside the dialog', () => {
    const dialog = makeDialog();
    dialog.querySelector<HTMLAnchorElement>('a')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    trapTabKey(dialog, event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps focus on the container when there are no interactive controls', () => {
    const dialog = document.createElement('div');
    dialog.tabIndex = -1;
    document.body.append(dialog);
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    trapTabKey(dialog, event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
  });
});
