import { fireEvent, render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import GlobalSearch from './GlobalSearch';

const items = [
  { id: 'overview' as const, label: '生产总览', icon: Search },
  { id: 'records' as const, label: '农事记录', icon: Search },
  { id: 'batches' as const, label: '批次记录', icon: Search },
];

describe('GlobalSearch keyboard model', () => {
  it('exposes combobox, listbox, and option semantics and opens the active result', () => {
    const onOpen = vi.fn();
    render(<GlobalSearch items={items} onOpen={onOpen} idPrefix="desktop-search" />);

    const input = screen.getByRole('combobox', { name: '全局搜索' });
    fireEvent.change(input, { target: { value: '记录' } });

    const listbox = screen.getByRole('listbox', { name: '菜单结果' });
    const options = screen.getAllByRole('option');
    expect(listbox.id).toBe('desktop-search-listbox');
    expect(options).toHaveLength(2);
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onOpen).toHaveBeenCalledWith('batches');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clamps arrow navigation and lets pointer hover update the active option', () => {
    render(<GlobalSearch items={items} onOpen={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: '全局搜索' });
    fireEvent.change(input, { target: { value: '记录' } });
    const options = screen.getAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.mouseEnter(options[1]);
    expect(options[1].getAttribute('aria-selected')).toBe('true');
  });

  it('clears results with Escape and announces no-match state without options', () => {
    render(<GlobalSearch items={items} onOpen={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: '全局搜索' });
    fireEvent.change(input, { target: { value: '不存在' } });

    expect(screen.getByRole('status').textContent).toContain('没有匹配菜单');
    expect(screen.queryByRole('option')).toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('focuses only the shortcut-enabled search for Ctrl/Cmd+K', () => {
    render(
      <div>
        <GlobalSearch items={items} onOpen={vi.fn()} idPrefix="desktop" />
        <GlobalSearch items={items} onOpen={vi.fn()} idPrefix="mobile" enableShortcut={false} />
      </div>,
    );
    const [desktop, mobile] = screen.getAllByRole('combobox', { name: '全局搜索' });

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(desktop);
    expect(document.activeElement).not.toBe(mobile);
  });
});
