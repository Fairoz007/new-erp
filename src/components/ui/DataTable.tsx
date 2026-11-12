import React, { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
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
  FileText,
  FileDown,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { useAuth } from '../../context/AuthContext';
import { useOptionalFleet } from '../../context/FleetContext';
import type { CollectionKey } from '../../services/core';
import { exportToCSV, exportToPDF, cellToText } from '../../utils/export';
import { ReportPreviewModal } from '../common/ReportPreviewModal';
import { useQuery } from '../../lib/queryCache';
import { fetchAllPages, type ServerSource, type ListSort, type FetchAllProgress } from '../../lib/serverList';

/** Plain text of a rendered cell (what the user sees), for PDF / document view / non-field columns. */
function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).filter(Boolean).join(' ');
  const el = node as { props?: { children?: ReactNode; title?: string } };
  return el.props ? nodeToText(el.props.children) : '';
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Raw value for sorting and CSV when it is not row[key] (e.g. custom fields). */
  value?: (row: T) => unknown;
  /** Server mode: the database column this column sorts by. Without it the column is not sortable in server mode. */
  sortKey?: string;
  /** Long text (names, descriptions, notes, emails): cut with an ellipsis at a max width (default 16rem, or the
   *  Tailwind max-width class given) and show the full value as a tooltip. */
  truncate?: boolean | string;
}

const alignCls = (align?: 'left' | 'center' | 'right') =>
  align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left';

interface DataTableProps<T> {
  /** Rows (client mode). Ignored when `server` is given. */
  data?: T[];
  /** Server mode: paging, sorting, search and count run in the database; exports fetch every filtered row in pages. */
  server?: ServerSource<T>;
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
  /** More filter controls shown next to filterComponent (e.g. custom field filter). */
  extraFilters?: ReactNode;
  pageSizeDefault?: number;
  /** Permission module that gates the export button; omitted = always allowed. */
  exportModule?: string;
  /** Loading / error state. Pages backed by FleetContext pass `collection` and get both for free;
   *  pages with their own data hooks pass `loading` / `error` / `onRetry` explicitly. */
  collection?: CollectionKey | CollectionKey[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Extra searchable text per row (e.g. custom field values). */
  searchText?: (row: T) => string;
}

export function DataTable<T extends Record<string, any>>({
  data: dataProp,
  server,
  columns,
  keyExtractor,
  searchPlaceholder = 'Search records...',
  searchFields,
  searchText,
  title,
  description,
  actionButton,
  exportFilename = 'export_data',
  emptyMessage = 'No records found matching your criteria.',
  onRowClick,
  filterComponent,
  extraFilters,
  pageSizeDefault = 10,
  exportModule,
  collection,
  loading: loadingProp,
  error: errorProp,
  onRetry,
}: DataTableProps<T>) {
  const { hasPermission } = useAuth();
  const isServer = !!server;
  const data = useMemo(() => (isServer ? [] : dataProp ?? []), [isServer, dataProp]);
  const fleet = useOptionalFleet();
  const keys = collection ? (Array.isArray(collection) ? collection : [collection]) : [];
  const collectionError = keys.map(k => fleet?.loadErrors[k]).find(Boolean);
  const collectionLoading = keys.length > 0 && fleet ? keys.some(k => !fleet.isCollectionLoaded(k)) : false;
  const canExport = !exportModule || hasPermission('export', exportModule);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  // Debounce search input (longer in server mode: each change is a request)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, isServer ? 300 : 150);
    return () => clearTimeout(timer);
  }, [searchTerm, isServer]);

  // ---------------- server mode: one page from the database
  const serverSort: ListSort | undefined = useMemo(() => {
    if (!isServer || !sortKey) return undefined;
    const col = columns.find(c => c.key === sortKey);
    return col?.sortKey ? { column: col.sortKey, ascending: sortDirection === 'asc' } : undefined;
  }, [isServer, sortKey, sortDirection, columns]);
  const serverKey = server?.key ?? '';
  // filters / office changed: back to page 1
  const lastServerKey = useRef(serverKey);
  useEffect(() => {
    if (lastServerKey.current !== serverKey) { lastServerKey.current = serverKey; setCurrentPage(1); }
  }, [serverKey]);
  const serverFetch = server?.fetch;
  const pageQuery = useQuery(
    `list:${serverKey}|p${currentPage}|s${pageSize}|q${debouncedSearch}|o${serverSort ? `${serverSort.column}:${serverSort.ascending}` : ''}`,
    server?.tags ?? [],
    () => serverFetch!({ offset: (currentPage - 1) * pageSize, limit: pageSize, search: debouncedSearch, sort: serverSort }),
    { enabled: isServer },
  );

  const error = errorProp ?? (isServer ? pageQuery.error?.message : collectionError) ?? null;
  const loading = loadingProp ?? (isServer ? pageQuery.loading : collectionLoading);
  const retry = onRetry ?? (isServer ? () => { void pageQuery.refetch(); } : keys.length && fleet ? () => { void fleet.reload(keys); } : undefined);

  // Filter & Search
  const filteredData = useMemo(() => {
    if (!debouncedSearch.trim()) return data;
    const lower = debouncedSearch.toLowerCase();

    return data.filter(item => {
      if (searchText && searchText(item).toLowerCase().includes(lower)) return true;
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
  }, [data, debouncedSearch, searchFields, searchText]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    const col = columns.find(c => c.key === sortKey);
    const get = (row: T) => (col?.value ? col.value(row) : row[sortKey]);
    return [...filteredData].sort((a, b) => {
      const valA = get(a) as any;
      const valB = get(b) as any;

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
  }, [filteredData, sortKey, sortDirection, columns]);

  // Pagination
  const totalRows = isServer ? pageQuery.data?.total ?? 0 : sortedData.length;
  const totalPages = Math.ceil(totalRows / pageSize) || 1;
  // Keep the page in range when rows are deleted or filtered away
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  const paginatedData = useMemo(() => {
    if (isServer) return pageQuery.data?.rows ?? [];
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [isServer, pageQuery.data, sortedData, currentPage, pageSize]);
  const isSortable = (col: Column<T>) => col.sortable !== false && (!isServer || !!col.sortKey);

  const handleSort = (key: string) => {
    setCurrentPage(1);
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

  // Export columns: the visible data columns (action columns carry no data)
  const exportColumns = activeColumns.filter(c => c.sortable !== false && c.key !== 'actions');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const reportTitle = title || exportFilename.replace(/_/g, ' ');
  // Exports cover the full filtered result. Server mode fetches it page by page (progress + cancel).
  const [exportProgress, setExportProgress] = useState<FetchAllProgress | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<T[] | null>(null);
  const allRows = async (): Promise<T[] | null> => {
    if (!isServer || !serverFetch) return sortedData;
    const ctrl = new AbortController();
    exportAbort.current = ctrl;
    setExportError(null);
    setExportProgress({ loaded: 0, total: totalRows });
    try {
      return await fetchAllPages(serverFetch, { search: debouncedSearch, sort: serverSort }, setExportProgress, ctrl.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setExportError((e as Error).message || 'Export failed');
      return null;
    } finally {
      setExportProgress(null);
      exportAbort.current = null;
    }
  };
  // Documents show what the screen shows (formatted dates, currency, names); CSV keeps raw values.
  const previewRows = (rows: T[] = sortedData) => rows.map((row, i) => exportColumns.map(c => {
    const shown = c.render ? nodeToText(c.render(row, i)).replace(/\s+/g, ' ').trim() : '';
    return shown || cellToText(row[c.key]);
  }));
  const csvValue = (row: T, c: Column<T>, i: number) => {
    const raw = c.value ? c.value(row) : row[c.key];
    if (raw !== null && raw !== undefined && typeof raw !== 'object' && !(typeof raw === 'string' && raw.startsWith('storage://'))) return raw;
    return c.render ? nodeToText(c.render(row, i)).replace(/\s+/g, ' ').trim() : '';
  };
  const handleExportCsv = async () => {
    setExportMenuOpen(false);
    const rows = previewData ?? await allRows();
    if (!rows) return;
    const flat = rows.map((row, i) => Object.fromEntries(exportColumns.map(c => [c.key, csvValue(row, c, i)])));
    exportToCSV(exportFilename, flat, exportColumns.map(c => ({ key: c.key, label: c.header })));
  };
  const handleExportPdf = async () => {
    setExportMenuOpen(false);
    const rows = previewData ?? await allRows();
    if (!rows) return;
    const rightAlign = exportColumns.map((c, i) => (c.align === 'right' ? i : -1)).filter(i => i >= 0);
    void exportToPDF(exportFilename, reportTitle, exportColumns.map(c => c.header), previewRows(rows), { rightAlign });
  };
  const openPreview = async () => {
    setExportMenuOpen(false);
    const rows = await allRows();
    if (!rows) return;
    setPreviewData(rows);
    setPreviewOpen(true);
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
          {extraFilters}
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
          {canExport && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportMenuOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                leftIcon={<Download className="w-3.5 h-3.5 text-slate-400" />}
                rightIcon={<ChevronDown className="w-3 h-3 text-slate-400" />}
              >
                Export
              </Button>
              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 mt-1.5 w-52 z-20 bg-white border border-slate-700 rounded-xl shadow-lg py-1 text-xs font-semibold text-slate-200">
                    <button role="menuitem" className="w-full text-left px-3.5 py-2 hover:bg-slate-850 flex items-center gap-2 cursor-pointer" onClick={() => { void openPreview(); }}>
                      <FileText className="w-3.5 h-3.5" /> View as document
                    </button>
                    <button role="menuitem" className="w-full text-left px-3.5 py-2 hover:bg-slate-850 flex items-center gap-2 cursor-pointer" onClick={() => { void openPreview(); }}>
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                    <button role="menuitem" className="w-full text-left px-3.5 py-2 hover:bg-slate-850 flex items-center gap-2 cursor-pointer" onClick={() => { void handleExportPdf(); }}>
                      <FileDown className="w-3.5 h-3.5" /> Download PDF
                    </button>
                    <button role="menuitem" className="w-full text-left px-3.5 py-2 hover:bg-slate-850 flex items-center gap-2 cursor-pointer" onClick={() => { void handleExportCsv(); }}>
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Download CSV (Excel)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {previewOpen && previewData && (
            <ReportPreviewModal
              isOpen
              onClose={() => { setPreviewOpen(false); setPreviewData(null); }}
              title={reportTitle}
              columns={exportColumns.map(c => c.header)}
              rows={previewRows(previewData)}
              onDownloadPdf={() => { void handleExportPdf(); }}
              onDownloadCsv={() => { void handleExportCsv(); }}
            />
          )}
          {exportProgress && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-slate-300">
              <span>Preparing export… {exportProgress.loaded.toLocaleString()} of {exportProgress.total.toLocaleString()} rows</span>
              <Button variant="ghost" size="xs" onClick={() => exportAbort.current?.abort()}>Cancel</Button>
            </div>
          )}
          {exportError && <span role="alert" className="text-xs text-rose-600">{exportError}</span>}
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
                  className={`px-6 py-4 select-none ${isSortable(col) ? 'cursor-pointer hover:text-slate-100' : ''} ${alignCls(col.align)}`}
                  onClick={() => isSortable(col) && handleSort(col.key)}
                >
                  <div
                    className={`inline-flex items-center gap-1.5 ${
                      col.align === 'right' ? 'justify-end w-full' : col.align === 'center' ? 'justify-center w-full' : ''
                    }`}
                  >
                    <span>{col.header}</span>
                    {isSortable(col) && (
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
            {error && paginatedData.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} className="px-5 py-14 text-center bg-white" role="alert">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <AlertTriangle className="w-8 h-8 text-rose-500 stroke-[1.5]" />
                    <p className="font-semibold text-rose-600 text-sm">Could not load records</p>
                    <p className="text-xs text-slate-400 max-w-md">{error}</p>
                    {retry && (
                      <button onClick={retry} className="text-xs text-forest-500 hover:underline mt-1 cursor-pointer font-semibold">
                        Try again
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : loading && paginatedData.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  {activeColumns.map(col => (
                    <td key={col.key} className="px-6 py-4"><div className="h-3.5 rounded bg-slate-800/60 animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors ${
                    onRowClick ? 'hover:bg-slate-850/70 cursor-pointer' : 'hover:bg-slate-850/40'
                  }`}
                >
                  {activeColumns.map(col => {
                    const content = col.render ? col.render(row, idx) : row[col.key] ?? '-';
                    return (
                      <td key={col.key} className={`px-6 py-4 whitespace-nowrap text-sm ${alignCls(col.align)}`}>
                        {col.truncate ? (
                          <div
                            className={`truncate [&_p]:truncate [&_div]:min-w-0 ${typeof col.truncate === 'string' ? col.truncate : 'max-w-[16rem]'} ${col.align === 'right' ? 'ml-auto' : ''}`}
                            title={nodeToText(content).replace(/\s+/g, ' ').trim() || undefined}
                          >
                            {content}
                          </div>
                        ) : content}
                      </td>
                    );
                  })}
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
              {totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-100 font-semibold">
              {Math.min(currentPage * pageSize, totalRows)}
            </strong>{' '}
            of <strong className="text-slate-100 font-semibold">{totalRows.toLocaleString()}</strong> records
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
