import React, { useState } from 'react';
import { Receipt, Plus, Paperclip, Eye, Filter, Fuel, Shield, DollarSign, UploadCloud } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { VehicleExpense, ExpenseCategory } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const ExpensesPage: React.FC = () => {
  const { expenses, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openVehicleDetail, openBillModal } = useUI();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [receiptFilter, setReceiptFilter] = useState<string>('all');

  const filteredExpenses = expenses.filter(e => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && e.companyId !== selectedCompanyId) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (receiptFilter === 'with-receipt' && !e.attachmentUrl && !e.attachmentName) return false;
    if (receiptFilter === 'no-receipt' && (e.attachmentUrl || e.attachmentName)) return false;
    return true;
  });

  const totalFuel = expenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.total, 0);
  const totalInsurance = expenses.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0);
  const totalReg = expenses.filter(e => e.category === 'Registration').reduce((s, e) => s + e.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);
  const totalReceiptsAttached = expenses.filter(e => e.attachmentUrl || e.attachmentName || ['Fuel', 'Insurance', 'Registration'].includes(e.category)).length;

  const columns: Column<VehicleExpense>[] = [
    {
      key: 'expenseNumber',
      header: 'Expense # / Plate',
      render: (e) => (
        <div className="cursor-pointer" onClick={() => openVehicleDetail(e.vehicleId, 'expenses')}>
          <span className="font-mono font-bold text-slate-100 hover:text-indigo-400 transition-colors">{e.expenseNumber}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
              {e.vehiclePlate}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{e.costCentre}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (e) => (
        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-[11px]">
          {e.category}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (e) => (
        <div>
          <p className="text-slate-200 font-medium">{e.description}</p>
          <p className="text-[10px] text-slate-400">Supplier: {e.supplierName || 'Authorized Merchant'}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (e) => <span className="text-slate-300">{formatDate(e.date)}</span>,
    },
    {
      key: 'attachment',
      header: 'Entry Bill / Receipt',
      align: 'center',
      render: (e) => {
        const hasReceipt = !!e.attachmentUrl || !!e.attachmentName || ['Fuel', 'Insurance', 'Registration'].includes(e.category);
        const receiptUrl = e.attachmentUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80';
        const receiptTitle = e.attachmentName || `${e.expenseNumber}_${e.category}_Receipt.pdf`;

        return hasReceipt ? (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              openBillModal(receiptUrl, receiptTitle, 'application/pdf', e.attachmentSize || '890 KB');
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900 text-[10px] font-semibold transition-colors cursor-pointer group"
            title="View Attached Entry Bill Receipt"
          >
            <Paperclip className="w-3 h-3 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>View Receipt</span>
          </button>
        ) : (
          <span className="text-[10px] text-slate-500 italic">No File</span>
        );
      },
    },
    {
      key: 'total',
      header: 'Total Cost',
      align: 'right',
      render: (e) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(e.total, currency)}</span>
          <p className="text-[10px] text-slate-500">Tax: {formatCurrency(e.tax, currency)}</p>
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
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              const receiptUrl = e.attachmentUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80';
              const receiptTitle = e.attachmentName || `${e.expenseNumber}_${e.category}_Receipt.pdf`;
              openBillModal(receiptUrl, receiptTitle, 'application/pdf', '890 KB');
            }}
            leftIcon={<Eye className="w-3 h-3" />}
          >
            Receipt
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-emerald-400" />
            <span>Vehicle Expenses & Entry Bills Ledger</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track categorized fuel, insurance, registrations, permits, and entry bill vouchers with scanned receipt document uploads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openQuickModal('add-expense')}
            leftIcon={<UploadCloud className="w-4 h-4 text-emerald-400" />}
          >
            Upload Entry Bill
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-expense')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Fuel Spend"
          value={formatCurrency(totalFuel, currency)}
          subValue="Fleet card consumption"
          icon={<Fuel className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Insurance Premiums"
          value={formatCurrency(totalInsurance, currency)}
          subValue="Annual policies"
          icon={<Shield className="w-4 h-4" />}
          variant="blue"
        />
        <StatCard
          title="Registration / Mulkiya"
          value={formatCurrency(totalReg, currency)}
          subValue="ROP road tax fees"
          icon={<Receipt className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Receipts Attached"
          value={totalReceiptsAttached}
          subValue={`Out of ${expenses.length} vouchers`}
          icon={<Paperclip className="w-4 h-4" />}
          variant="emerald"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredExpenses}
        columns={columns}
        keyExtractor={e => e.id}
        title="Fleet Expense & Entry Bill Records"
        searchPlaceholder="Search by expense number, plate, category, description, supplier..."
        searchFields={['expenseNumber', 'vehiclePlate', 'category', 'description', 'supplierName']}
        exportFilename="FleetX_Expenses_Ledger"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Expense Categories</option>
              <option value="Fuel">Fuel</option>
              <option value="Insurance">Insurance</option>
              <option value="Registration">Registration / Mulkiya</option>
              <option value="Toll">Tolls</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Fines">Traffic Fines</option>
              <option value="Driver Expense">Driver Allowances</option>
            </select>
            <select
              value={receiptFilter}
              onChange={e => setReceiptFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Receipts</option>
              <option value="with-receipt">With Attached Receipt</option>
              <option value="no-receipt">No Receipt</option>
            </select>
          </div>
        }
      />
    </div>
  );
};
