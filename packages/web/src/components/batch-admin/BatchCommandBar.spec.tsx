import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { activeBatchFilterCount, BatchCommandBar } from './BatchCommandBar';

const fields = [{ id: 'field-1', name: '东区一号地', area: 10 }] as never[];

function Harness() {
  const [filterType, setFilterType] = useState('阳光玫瑰');
  const [filterHouse, setFilterHouse] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('2024');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  return (
    <BatchCommandBar
      fields={fields}
      searchCode=""
      setSearchCode={vi.fn()}
      filterType={filterType}
      setFilterType={setFilterType}
      filterHouse={filterHouse}
      setFilterHouse={setFilterHouse}
      filterDateRange={filterDateRange}
      setFilterDateRange={setFilterDateRange}
      showAdvancedFilter={showAdvancedFilter}
      setShowAdvancedFilter={setShowAdvancedFilter}
      clearFilters={() => {
        setFilterType('all');
        setFilterHouse('all');
        setFilterDateRange('all');
      }}
      selectedCount={0}
      exportDropdownOpen={false}
      setExportDropdownOpen={vi.fn()}
      exporting={null}
      onExport={vi.fn()}
      onCreate={vi.fn()}
      onReload={vi.fn()}
    />
  );
}

describe('BatchCommandBar filters', () => {
  it('counts only non-default filters', () => {
    expect(activeBatchFilterCount({
      filterType: '阳光玫瑰',
      filterHouse: 'all',
      filterDateRange: '2024',
    })).toBe(2);
    expect(activeBatchFilterCount({
      filterType: 'all',
      filterHouse: 'all',
      filterDateRange: 'all',
    })).toBe(0);
  });

  it('keeps search visible and renders each labelled filter only once when expanded', () => {
    render(<Harness />);

    expect(screen.getByPlaceholderText('按批次号搜索')).toBeTruthy();
    expect(screen.queryByLabelText('品种')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '筛选 (2)' }));

    expect(screen.getAllByLabelText('品种')).toHaveLength(1);
    expect(screen.getAllByLabelText('地块')).toHaveLength(1);
    expect(screen.getAllByLabelText('日期')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }));
    expect(screen.getByRole('button', { name: '筛选' })).toBeTruthy();
  });
});
