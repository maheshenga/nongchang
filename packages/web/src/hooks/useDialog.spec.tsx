import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { alertDialog, confirmDialog, DialogHost } from './useDialog';

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    if (/\.spec\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

describe('DialogHost', () => {
  it('resolves confirm true from the primary action', async () => {
    render(<DialogHost />);

    let result: boolean | undefined;
    await act(async () => {
      void confirmDialog({ title: '停用代理商', message: '确认停用该代理商？', confirmLabel: '停用' })
        .then((value) => { result = value; });
    });

    expect(screen.getByRole('dialog', { name: '停用代理商' })).toBeTruthy();
    expect(screen.getByText('确认停用该代理商？')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '停用' }));
    });

    await waitFor(() => expect(result).toBe(true));
    expect(screen.queryByRole('dialog', { name: '停用代理商' })).toBeNull();
  });

  it('resolves confirm false from cancel', async () => {
    render(<DialogHost />);

    let result: boolean | undefined;
    await act(async () => {
      void confirmDialog('确认删除？').then((value) => { result = value; });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '取消' }));
    });

    await waitFor(() => expect(result).toBe(false));
  });

  it('resolves alert after acknowledgement', async () => {
    render(<DialogHost />);

    let resolved = false;
    await act(async () => {
      void alertDialog({ title: '操作失败', message: '后端拒绝删除' }).then(() => { resolved = true; });
    });

    expect(screen.getByRole('dialog', { name: '操作失败' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    });

    await waitFor(() => expect(resolved).toBe(true));
  });

  it('resolves an open confirmation as cancelled when the host unmounts', async () => {
    const view = render(<DialogHost />);

    let result: boolean | undefined;
    await act(async () => {
      void confirmDialog({ title: '删除套餐', message: '确认删除套餐？', confirmLabel: '删除' })
        .then((value) => { result = value; });
    });

    expect(screen.getByRole('dialog', { name: '删除套餐' })).toBeTruthy();

    await act(async () => {
      view.unmount();
    });

    await waitFor(() => expect(result).toBe(false));
  });

  it('renders through the global modal portal and cancels on Escape', async () => {
    const view = render(<div data-testid="app-host"><DialogHost /></div>);
    let result: boolean | undefined;

    await act(async () => {
      void confirmDialog({ title: '离开页面', message: '确认离开？' })
        .then((value) => { result = value; });
    });

    const dialog = screen.getByRole('dialog', { name: '离开页面' });
    expect(view.container.contains(dialog)).toBe(false);
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(result).toBe(false));
  });

  it('restores focus to the button that opened the confirmation', async () => {
    render(<><button type="button">触发按钮</button><DialogHost /></>);
    const trigger = screen.getByRole('button', { name: '触发按钮' });
    trigger.focus();

    await act(async () => {
      void confirmDialog('确认操作？');
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('native dialog usage', () => {
  it('does not use browser alert or confirm in production web UI sources', () => {
    const roots = ['components', 'hooks', 'ui'].map((part) => join(__dirname, '..', part));
    const offenders = roots.flatMap(sourceFiles).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /window\.alert|window\.confirm|\bconfirm\(|\balert\(/.test(source)
        ? [relative(join(__dirname, '..'), file)]
        : [];
    });

    expect(offenders).toEqual([]);
  });
});
