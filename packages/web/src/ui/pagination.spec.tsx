import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MANAGEMENT_PAGE_SIZE, MANAGEMENT_PAGE_SIZE_OPTIONS, PaginationControls } from './pagination';

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

  it('defaults management lists to 50 and offers bounded page sizes', () => {
    expect(MANAGEMENT_PAGE_SIZE).toBe(50);
    expect(MANAGEMENT_PAGE_SIZE_OPTIONS).toEqual([20, 50, 100]);
    const onPageSizeChange = vi.fn();
    render(
      <PaginationControls
        page={1}
        pageSize={50}
        total={120}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    const pageSize = screen.getByRole('combobox', { name: '每页条数' });
    expect([...pageSize.querySelectorAll('option')].map(option => option.value)).toEqual(['20', '50', '100']);
    fireEvent.change(pageSize, { target: { value: '20' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });
});
