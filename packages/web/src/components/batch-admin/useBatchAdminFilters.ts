import { useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE, filterBatches, paginateBatches, type ViewBatch } from '../BatchAdmin.model';

export function useBatchAdminFilters(batches: ViewBatch[]) {
  const [searchCode, setSearchCode] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterHouse, setFilterHouse] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [page, setPage] = useState(1);
  const filteredData = useMemo(
    () => filterBatches(batches, { searchCode, filterType, filterHouse, filterDateRange }),
    [batches, filterDateRange, filterHouse, filterType, searchCode],
  );
  const pagedData = useMemo(() => paginateBatches(filteredData, page, PAGE_SIZE), [filteredData, page]);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));

  useEffect(() => setPage(1), [filterDateRange, filterHouse, filterType, searchCode]);

  return {
    searchCode, setSearchCode,
    filterType, setFilterType,
    filterHouse, setFilterHouse,
    filterDateRange, setFilterDateRange,
    showAdvancedFilter, setShowAdvancedFilter,
    page, setPage,
    filteredData, pagedData, totalPages,
    clearFilters: () => {
      setSearchCode('');
      setFilterType('all');
      setFilterHouse('all');
      setFilterDateRange('all');
    },
  };
}
