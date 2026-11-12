import React, { useState } from 'react';
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
import { VehicleExpense, ExpenseCategory } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { useCustomFields, useCustomFieldFilter, withCustomColumns } from '../../hooks/useCustomFields';


// Expenses that count as costs: approved (posted) or waiting for approval. Drafts and rejected ones do not.
const counts = (e: VehicleExpense) => e.status === 'Approved' || e.status === 'Pending Approval';

const mimeOf = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/pdf';
};

export const ExpensesPage: React.FC = () => {
  const { expenses, vehicles, currency, selectedCompanyId } = useFleet();
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
  const [openId, setOpenId] = useState<string | null>(null);
  const { rows: dbCategories } = useMaster<ExpenseCategoryRow>('expenseCategories');
  const categoryNames = Array.from(new Set([...dbCategories.map(c => c.name), ...expenses.map(e => e.category)])).sort();
  const opened = openId ? expenses.find(e => e.id === openId) ?? null : null;

  const filteredExpenses = expenses.filter(e => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && e.companyId !== selectedCompanyId) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (statusFilter === 'unpaid' ? !(e.status === 'Approved' && e.paymentStatus === 'Unpaid') : statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (vehicleFilter !== 'all' && e.vehicleId !== vehicleFilter) return false;
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    if (receiptFilter === 'with-receipt' && !e.attachmentUrl) return false;
    if (receiptFilter === 'no-receipt' && e.attachmentUrl) return false;
    return true;
  });

  const inOffice = expenses.filter(e => !selectedCompanyId || selectedCompanyId === 'all' || e.companyId === selectedCompanyId);
  const scoped = inOffice.filter(counts);
  const totalFuel = scoped.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.total, 0);
  const pending = inOffice.filter(e => e.status === 'Pending Approval');
  const unpaid = inOffice.filter(e => e.status === 'Approved' && e.paymentStatus === 'Unpaid');
  const drafts = inOffice.filter(e => e.status === 'Draft' || e.status === 'Rejected');
  const totalExpenses = scoped.filter(e => e.status === 'Approved').reduce((s, e) => s + e.total, 0);
  // Breakdown of what the current filters show, largest category first
  const filteredTotal = filteredExpenses.filter(counts).reduce((s, e) => s + e.total, 0);
  const byCategory = Object.entries(filteredExpenses.filter(counts).reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.total; return acc; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const scopedVehicles = vehicles.filter(v => !selectedCompanyId || selectedCompanyId === 'all' || v.companyId === selectedCompanyId);
  const totalReceiptsAttached = scoped.filter(e => !!e.attachmentUrl).length;

  const openReceipt = (e: VehicleExpense) => {
    if (!e.attachmentUrl) return;
    const name = e.attachmentName || `${e.expenseNumber}_receipt`;
    // attachmentUrl is a storage://documents/<path> reference: the viewer resolves it to a short-lived signed URL
    openBillModal(e.attachmentUrl, name, mimeOf(name), '');
  };

  const columns: Column<VehicleExpense>[] = [
    {
      key: 'expenseNumber',
      header: 'Expense # / Plate',
      render: (e) => (
        <div className={e.vehicleId ? 'cursor-pointer' : ''} onClick={() => e.vehicleId && openVehicleDetail(e.vehicleId, 'expenses')}>
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
      header: 'Category',
      render: (e) => (
        <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-slate-200 font-bold text-[10px]">
          {e.category}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (e) => (
        <div className="max-w-md">
          <p className="text-slate-200 font-medium line-clamp-1">{e.description}</p>
          <p className="text-[10px] text-slate-400">{e.supplierName ? `Supplier: ${e.supplierName}` : 'No supplier recorded'}</p>
        </div>
      ),
    },
    {
      key: 'date',
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
          <Button variant="ghost" size="xs" onClick={() => setOpenId(e.id)}>Open</Button>
          {e.attachmentUrl && (
            <Button variant="ghost" size="xs" onClick={() => openReceipt(e)} leftIcon={<Eye className="w-3 h-3" />}>
              Receipt
            </Button>
          )}
        </div>
      ),
    },
  ];

  // custom fields: list columns, search and filter (Settings → Custom fields)
  const cfList = useCustomFields('expense');
  const { filtered: cfRows, ui: cfFilter } = useCustomFieldFilter(cfList.defs, filteredExpenses);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Expenses
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Office, vehicle and staff expenses with receipts. Expenses within your limit post to the ledger when submitted; larger ones go to Approvals.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
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
        </div>
      </div>

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
          value={formatCurrency(pending.reduce((s, e) => s + e.total, 0), currency)}
          subValue={`${pending.length} expense(s) · ${drafts.length} draft(s) not submitted`}
        />
        <StatCard
          title="Approved, not paid"
          value={formatCurrency(unpaid.reduce((s, e) => s + e.total, 0), currency)}
          subValue={`${unpaid.length} expense(s) on payables`}
        />
        <StatCard
          title="Approved expenses"
          value={formatCurrency(totalExpenses, currency)}
          subValue={`${totalReceiptsAttached} with receipt attached`}
        />
      </div>

      <Tabs variant="segmented" tabs={[{ id: 'list', label: 'All expenses' }, { id: 'monthly', label: 'Monthly expenses' }]} activeTab={tab} onChange={setTab} />
      {opened && <ExpenseDetailModal expense={opened} onClose={() => setOpenId(null)} onOpenReceipt={openReceipt} />}
      {tab === 'monthly' ? <MonthlyExpensesPanel onOpen={e => setOpenId(e.id)} /> : <>
      {/* Spend breakdown for the current filters */}
      {byCategory.length > 0 && (
        <div className="bg-white border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-100">Spend by category</h3>
            <span className="text-xs font-bold text-slate-300">{filteredExpenses.length} voucher(s) · {formatCurrency(filteredTotal, currency)}</span>
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
        data={cfRows}
        collection={'expenses'}
        columns={withCustomColumns(columns, cfList.listColumns<VehicleExpense>())}
        searchText={cfList.searchText}
        extraFilters={cfFilter}
        keyExtractor={e => e.id}
        title="Expense register"
        searchPlaceholder="Search expenses by expense number, plate, category, vendor or cost centre..."
        searchFields={['expenseNumber', 'vehiclePlate', 'category', 'description', 'supplierName', 'costCentre']}
        exportFilename="Expenses_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Expense Categories</option>
              {categoryNames.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Status"
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Pending Approval">Pending approval</option>
              <option value="Approved">Approved</option>
              <option value="unpaid">Approved, not paid</option>
              <option value="Rejected">Rejected</option>
            </select>
            <select
              value={receiptFilter}
              onChange={e => setReceiptFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Vouchers</option>
              <option value="with-receipt">With Attached Bill Scan</option>
              <option value="no-receipt">Without Receipt</option>
            </select>
            <select
              value={vehicleFilter}
              onChange={e => setVehicleFilter(e.target.value)}
              aria-label="Vehicle"
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Vehicles</option>
              {scopedVehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
            </select>
            <input aria-label="From date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200" />
            <input aria-label="To date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200" />
          </div>
        }
      />
      </>}
    </div>
  );
};
