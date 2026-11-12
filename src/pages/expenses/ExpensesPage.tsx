import React, { useMemo, useState } from 'react';
import { Plus, Paperclip, Eye } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ExpenseDetailModal } from './ExpenseDetailModal';
import { MonthlyExpensesPanel } from './MonthlyExpensesPanel';
import { useMaster } from '../../hooks/useMaster';
import type { ExpenseCategory as ExpenseCategoryRow } from '../../services/org';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { VehicleExpense } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { useCustomFields, withCustomColumns } from '../../hooks/useCustomFields';
import { expenseSource, useExpenseSummary, type ExpenseFilter } from '../../services/queries';
import { useExpensePageFigures, useOpenExpense, useServerCustomFieldFilter } from '../../services/queries-expenses';
import { FilterInput, FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';
import { buttonLike } from '../../lib/a11y';


const mimeOf = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/pdf';
};

export const ExpensesPage: React.FC = () => {
  const { vehicles, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openVehicleDetail, openBillModal } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'expenses');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [receiptFilter, setReceiptFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tab, setTab] = useState('list');
  const [openRow, setOpenRow] = useState<VehicleExpense | null>(null);
  const { rows: dbCategories } = useMaster<ExpenseCategoryRow>('expenseCategories');

  // custom fields: list columns and filter (Settings → Custom fields); the filter runs in the database
  const cfList = useCustomFields('expense');
  const { cf, ui: cfFilter } = useServerCustomFieldFilter(cfList.defs);

  // The register is paged, filtered and searched in the database (expense_page); the figures come
  // from expense_summary / expense_page_figures. "Counted" = approved or pending approval.
  const filter: ExpenseFilter = {
    company: selectedCompanyId,
    category: categoryFilter,
    status: statusFilter,
    vehicle: vehicleFilter,
    from: fromDate || undefined,
    to: toDate || undefined,
    receipt: receiptFilter !== 'all' ? receiptFilter as ExpenseFilter['receipt'] : undefined,
  };
  const filterKey = JSON.stringify(filter);
  const source = useMemo(() => expenseSource({ ...filter, cf }), [filterKey, JSON.stringify(cf)]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useExpenseSummary(filter);
  const figures = useExpensePageFigures(filter);
  const s = summary.data;
  const fig = figures.data;
  const opened = useOpenExpense(openRow);

  const categoryNames = Array.from(new Set([...dbCategories.map(c => c.name), ...(fig?.categories ?? [])])).sort();
  const totalFuel = s?.fuel_total ?? 0;
  const pendingTotal = fig?.pending_total ?? 0;
  const pendingCount = s?.pending_count ?? 0;
  const unpaidTotal = fig?.unpaid_total ?? 0;
  const unpaidCount = s?.unpaid_count ?? 0;
  const draftCount = s?.draft_count ?? 0;
  const totalExpenses = s?.approved_total ?? 0;
  // Breakdown of what the current filters show (custom field filter and search excluded), largest category first
  const filteredTotal = s?.filtered_total ?? 0;
  const filteredCount = fig?.filtered_count ?? 0;
  const byCategory = s?.by_category ?? [];
  const scopedVehicles = vehicles.filter(v => !selectedCompanyId || selectedCompanyId === 'all' || v.companyId === selectedCompanyId);
  const totalReceiptsAttached = s?.receipts_count ?? 0;
  const figuresError = summary.error ?? figures.error;

  const openReceipt = (e: VehicleExpense) => {
    if (!e.attachmentUrl) return;
    const name = e.attachmentName || `${e.expenseNumber}_receipt`;
    // attachmentUrl is a storage://documents/<path> reference: the viewer resolves it to a short-lived signed URL
    openBillModal(e.attachmentUrl, name, mimeOf(name), '');
  };

  const columns: Column<VehicleExpense>[] = [
    {
      key: 'expenseNumber',
      sortKey: 'expense_number',
      header: 'Expense # / Plate',
      render: (e) => (
        <div {...(e.vehicleId ? buttonLike : {})} className={e.vehicleId ? 'cursor-pointer' : ''} onClick={() => e.vehicleId && openVehicleDetail(e.vehicleId, 'expenses')}>
          <span className="font-mono font-bold text-slate-100 hover:text-[#086343] transition-colors">{e.expenseNumber}</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono font-bold text-[10px]">
              {e.vehiclePlate || 'No vehicle'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-medium">{e.costCentre}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      sortKey: 'status',
      header: 'Status',
      render: (e) => (
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge status={e.status} size="sm" />
          {e.status === 'Approved' && <StatusBadge status={e.paymentStatus} size="sm" />}
        </div>
      ),
    },
    {
      key: 'category',
      sortKey: 'category',
      header: 'Category',
      render: (e) => (
        <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-slate-200 font-bold text-[10px]">
          {e.category}
        </span>
      ),
    },
    {
      key: 'description',
      sortKey: 'description',
      header: 'Description',
      truncate: 'max-w-md',
      render: (e) => (
        <div className="max-w-md">
          <p className="text-slate-200 font-medium line-clamp-1">{e.description}</p>
          <p className="text-[10px] text-slate-400">{e.supplierName ? `Supplier: ${e.supplierName}` : 'No supplier recorded'}</p>
        </div>
      ),
    },
    {
      key: 'date',
      sortKey: 'date',
      header: 'Date & Cost Centre',
      render: (e) => (
        <div>
          <span className="text-slate-300 font-medium">{formatDate(e.date)}</span>
          {e.costCentre && <p className="text-[10px] text-slate-400 font-mono">{e.costCentre}</p>}
        </div>
      ),
    },
    {
      key: 'receiptDocument',
      header: 'Receipt / Bill Scan',
      sortable: false,
      render: (e) =>
        e.attachmentUrl ? (
          <button
            onClick={(ev) => { ev.stopPropagation(); openReceipt(e); }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCEFE5] text-[#06452F] hover:bg-[#bde2d0] text-[10px] font-bold transition-colors cursor-pointer group"
            title="View attached receipt"
          >
            <Paperclip className="w-3 h-3 text-[#086343] group-hover:scale-110 transition-transform" />
            <span>View Receipt</span>
          </button>
        ) : (
          <span className="text-[10px] text-slate-400 italic">No attachment</span>
        ),
    },
    {
      key: 'total',
      sortKey: 'total',
      header: 'Amount',
      align: 'right',
      render: (e) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(e.total, currency)}</span>
          <p className="text-[10px] text-slate-400">VAT: {formatCurrency(e.tax, currency)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (e) => (
        <div className="flex items-center justify-end" onClick={ev => ev.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => setOpenRow(e)}>Open</Button>
          {e.attachmentUrl && (
            <Button variant="ghost" size="xs" onClick={() => openReceipt(e)} leftIcon={<Eye className="w-3 h-3" />}>
              Receipt
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Expenses"
        description="Office, vehicle and staff expenses with receipts. Expenses within your limit post to the ledger when submitted; larger ones go to Approvals."
        actions={
          <>
            {canCreate && (
              <Button
                variant="primary"
                size="md"
                onClick={() => openQuickModal('add-expense')}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Expense
              </Button>
            )}
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Fuel Spend"
          value={formatCurrency(totalFuel, currency)}
          subValue="Category: Fuel"
          isHero={true}
        />
        <StatCard
          title="Awaiting approval"
          value={formatCurrency(pendingTotal, currency)}
          subValue={`${pendingCount} expense(s) · ${draftCount} draft(s) not submitted`}
        />
        <StatCard
          title="Approved, not paid"
          value={formatCurrency(unpaidTotal, currency)}
          subValue={`${unpaidCount} expense(s) on payables`}
        />
        <StatCard
          title="Approved expenses"
          value={formatCurrency(totalExpenses, currency)}
          subValue={`${totalReceiptsAttached} with receipt attached`}
        />
      </div>
      {figuresError && (
        <p role="alert" className="text-xs text-rose-500">
          Expense figures could not be loaded: {figuresError.message}{' '}
          <button type="button" className="underline" onClick={() => { void summary.refetch(); void figures.refetch(); }}>Retry</button>
        </p>
      )}

      <Tabs variant="segmented" tabs={[{ id: 'list', label: 'All expenses' }, { id: 'monthly', label: 'Monthly expenses' }]} activeTab={tab} onChange={setTab} />
      {opened && <ExpenseDetailModal expense={opened} onClose={() => setOpenRow(null)} onOpenReceipt={openReceipt} />}
      {tab === 'monthly' ? <MonthlyExpensesPanel onOpen={setOpenRow} /> : <>
      {/* Spend breakdown for the current filters */}
      {byCategory.length > 0 && (
        <div className="bg-white border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-100">Spend by category</h3>
            <span className="text-xs font-bold text-slate-300">{filteredCount} voucher(s) · {formatCurrency(filteredTotal, currency)}</span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {byCategory.slice(0, 8).map(([cat, amt]) => (
              <li key={cat} className="text-xs">
                <div className="flex justify-between mb-0.5"><span className="font-semibold text-slate-200">{cat}</span><span className="text-slate-300 font-mono">{formatCurrency(amt, currency)}</span></div>
                <div className="h-1.5 rounded-full bg-slate-850 overflow-hidden"><div className="h-full bg-[#086343]" style={{ width: `${filteredTotal > 0 ? Math.max(2, (amt / filteredTotal) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* DataTable */}
      <DataTable
        server={source}
        columns={withCustomColumns(columns, cfList.listColumns<VehicleExpense>())}
        extraFilters={cfFilter}
        keyExtractor={e => e.id}
        title="Expense register"
        searchPlaceholder="Search expenses by expense number, plate, category, vendor or cost centre..."
        exportFilename="Expenses_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              aria-label="Expense category"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Expense Categories</option>
              {categoryNames.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Status"
            >
              <option value="all">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Pending Approval">Pending approval</option>
              <option value="Approved">Approved</option>
              <option value="unpaid">Approved, not paid</option>
              <option value="Rejected">Rejected</option>
            </FilterSelect>
            <FilterSelect
              aria-label="Voucher"
              value={receiptFilter}
              onChange={e => setReceiptFilter(e.target.value)}
            >
              <option value="all">All Vouchers</option>
              <option value="with-receipt">With Attached Bill Scan</option>
              <option value="no-receipt">Without Receipt</option>
            </FilterSelect>
            <FilterSelect
              value={vehicleFilter}
              onChange={e => setVehicleFilter(e.target.value)}
              aria-label="Vehicle"
            >
              <option value="all">All Vehicles</option>
              {scopedVehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
            </FilterSelect>
            <FilterInput aria-label="From date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}  />
            <FilterInput aria-label="To date" type="date" value={toDate} onChange={e => setToDate(e.target.value)}  />
          </div>
        }
      />
      </>}
    </div>
  );
};
