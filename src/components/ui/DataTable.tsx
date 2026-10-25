import React, { useState, useMemo, useEffect, ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { exportToCSV } from '../../utils/export';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  searchPlaceholder?: string;
  searchFields?: (keyof T | string)[];
  title?: string;
  description?: string;
  actionButton?: ReactNode;
  exportFilename?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  filterComponent?: ReactNode;
  pageSizeDefault?: number;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  searchPlaceholder = 'Search records...',
  searchFields,
  title,
  description,
  actionButton,
  exportFilename = 'export_data',
  emptyMessage = 'No records found matching your criteria.',
  onRowClick,
  filterComponent,
  pageSizeDefault = 10,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    columns.forEach(col => {
      init[col.key] = true;
    });
    return init;
  });
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);

  // Filter & Search
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lower = searchTerm.toLowerCase();

    return data.filter(item => {
      if (searchFields && searchFields.length > 0) {
        return searchFields.some(field => {
          const val = item[field as string];
          if (val === undefined || val === null) return false;
          return String(val).toLowerCase().includes(lower);
        });
      }

      return Object.values(item).some(val => {
        if (val === undefined || val === null) return false;
        if (typeof val === 'object') return false;
        return String(val).toLowerCase().includes(lower);
      });
    });
  }, [data, searchTerm, searchFields]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (sortDirection === 'asc') {
        return strA.localeCompare(strB, undefined, { numeric: true });
      } else {
        return strB.localeCompare(strA, undefined, { numeric: true });
      }
    });
  }, [filteredData, sortKey, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  // Keep the page in range when rows are deleted or filtered away
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const activeColumns = columns.filter(col => visibleColumns[col.key] !== false);

  const handleExport = () => {
    const headers = activeColumns.map(c => ({ key: c.key as keyof T, label: c.header }));
    exportToCSV(exportFilename, sortedData, headers);
  };

  return (
    <div className="bg-white border border-slate-700 rounded-[20px] overflow-hidden shadow-card flex flex-col">
      {/* Top Header & Action Controls */}
      {(title || actionButton || description) && (
        <div className="px-5 sm:px-6 py-4.5 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
          <div>
            {title && <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">{title}</h3>}
            {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
          </div>
          {actionButton && <div className="flex items-center gap-2 shrink-0">{actionButton}</div>}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-3.5 sm:px-6 sm:py-3.5 border-b border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        <div className="flex-1 max-w-md">
          <Input
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            pill={true}
            leftIcon={<Search className="w-4 h-4 text-slate-400" />}
            className="text-xs sm:text-sm h-10 bg-slate-850 border-slate-700 focus:bg-white"
          />
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {filterComponent}

          {/* Column Visibility Toggle */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsColumnDropdownOpen(prev => !prev)}
              leftIcon={<SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />}
            >
              Columns
            </Button>

            {isColumnDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-700 rounded-2xl shadow-elevated z-30 p-2 text-xs">
                <p className="px-2.5 py-1.5 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Toggle Columns</p>
                <div className="max-h-48 overflow-y-auto space-y-0.5 mt-1">
                  {columns.map(col => (
                    <label key={col.key} className="flex min-h-8 items-center gap-2 px-2.5 py-1.5 hover:bg-slate-850 rounded-lg cursor-pointer text-slate-200">
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key] !== false}
                        onChange={e =>
                          setVisibleColumns(prev => ({ ...prev, [col.key]: e.target.checked }))
                        }
                        className="rounded border-slate-700 text-forest-500 focus:ring-0"
                      />
                      <span className="truncate">{col.header}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export to CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            leftIcon={<Download className="w-3.5 h-3.5 text-slate-400" />}
          >
            Export Data
          </Button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-850 text-slate-400 border-b border-slate-700 uppercase tracking-wider text-xs font-bold">
            <tr>
              {activeColumns.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-6 py-4 select-none ${col.sortable !== false ? 'cursor-pointer hover:text-slate-100' : ''} ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div
                    className={`inline-flex items-center gap-1.5 ${
                      col.align === 'right' ? 'justify-end w-full' : col.align === 'center' ? 'justify-center w-full' : ''
                    }`}
                  >
                    <span>{col.header}</span>
                    {col.sortable !== false && (
                      <span className="text-slate-400">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-forest-500" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-forest-500" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-30 hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/80 bg-white">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors ${
                    onRowClick ? 'hover:bg-slate-850/70 cursor-pointer' : 'hover:bg-slate-850/40'
                  }`}
                >
                  {activeColumns.map(col => (
                    <td
                      key={col.key}
                      className={`px-6 py-4 whitespace-nowrap text-sm ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {col.render ? col.render(row, idx) : row[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={activeColumns.length} className="px-5 py-14 text-center text-slate-400 bg-white">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Filter className="w-8 h-8 text-slate-400 stroke-[1.5]" />
                    <p className="font-semibold text-slate-200 text-sm">{emptyMessage}</p>
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="text-xs text-forest-500 hover:underline mt-1 cursor-pointer font-semibold"
                      >
                        Clear search filter
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-5 sm:px-6 py-3.5 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 bg-white">
        <div className="flex items-center gap-2.5">
          <span>
            Showing{' '}
            <strong className="text-slate-100 font-semibold">
              {sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-100 font-semibold">
              {Math.min(currentPage * pageSize, sortedData.length)}
            </strong>{' '}
            of <strong className="text-slate-100 font-semibold">{sortedData.length}</strong> records
          </span>

          <span className="text-slate-600">|</span>

          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="min-h-8 bg-slate-850 border border-slate-700 rounded-lg px-2.5 py-0.5 text-xs text-slate-200 focus:ring-1 focus:ring-forest-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            title="First Page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>

          <span className="px-2.5 font-semibold text-slate-100">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
            title="Last Page"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
