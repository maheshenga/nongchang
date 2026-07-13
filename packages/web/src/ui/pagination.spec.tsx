import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaginationControls } from './pagination';

describe('PaginationControls localization', () => {
  it('uses Chinese page, total, and navigation labels', () => {
    const onPageChange = vi.fn();
    render(<PaginationControls page={1} pageSize={100} total={201} onPageChange={onPageChange} />);

    expect(screen.getByText('第 1 / 3 页')).toBeTruthy();
    expect(screen.getByText('共 201 条')).toBeTruthy();
    expect((screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
