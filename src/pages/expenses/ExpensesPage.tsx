import React, { useState } from 'react';
import { Plus, Paperclip, Eye } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { VehicleExpense, ExpenseCategory } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';


const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Fuel', 'Maintenance', 'Repair', 'Oil', 'Tyres', 'Insurance', 'Registration', 'Parking', 'Toll', 'Cleaning', 'Inspection',
  'Fines', 'Accident', 'Loan', 'Lease', 'Driver Expense', 'Roadside Assistance', 'Other',
];

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

  const filteredExpenses = expenses.filter(e => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && e.companyId !== selectedCompanyId) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (vehicleFilter !== 'all' && e.vehicleId !== vehicleFilter) return false;
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    if (receiptFilter === 'with-receipt' && !e.attachmentUrl) return false;
    if (receiptFilter === 'no-receipt' && e.attachmentUrl) return false;
    return true;
  });

  const scoped = expenses.filter(e => !selectedCompanyId || selectedCompanyId === 'all' || e.companyId === selectedCompanyId);
  const totalFuel = scoped.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.total, 0);
  const totalInsurance = scoped.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0);
  const totalReg = scoped.filter(e => e.category === 'Registration').reduce((s, e) => s + e.total, 0);
  const totalExpenses = scoped.reduce((s, e) => s + e.total, 0);
  // Breakdown of what the current filters show, largest category first
  const filteredTotal = filteredExpenses.reduce((s, e) => s + e.total, 0);
  const byCategory = Object.entries(filteredExpenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.total; return acc; }, {}))
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Vehicle Expenses & Entry Bills Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Track categorized fuel, insurance, registrations, permits, and entry bill vouchers with scanned receipt document uploads.
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
          title="Insurance Premiums"
          value={formatCurrency(totalInsurance, currency)}
          subValue="Category: Insurance"
        />
        <StatCard
          title="Mulkiya Registration"
          value={formatCurrency(totalReg, currency)}
          subValue="Category: Registration"
        />
        <StatCard
          title="Total Fleet Expenses"
          value={formatCurrency(totalExpenses, currency)}
          subValue={`${totalReceiptsAttached} with receipt attached`}
        />
      </div>

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
        data={filteredExpenses}
        columns={columns}
        keyExtractor={e => e.id}
        title="Vehicle Operational Expenses Registry"
        searchPlaceholder="Search expenses by expense number, plate, category, vendor or cost centre..."
        searchFields={['expenseNumber', 'vehiclePlate', 'category', 'description', 'supplierName', 'costCentre']}
        exportFilename="FleetX_Expenses_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Expense Categories</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
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
    </div>
  );
};
