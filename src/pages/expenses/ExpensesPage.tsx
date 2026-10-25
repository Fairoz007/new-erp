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

  const scoped = expenses.filter(e => !selectedCompanyId || selectedCompanyId === 'all' || e.companyId === selectedCompanyId);
  const totalFuel = scoped.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.total, 0);
  const totalInsurance = scoped.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0);
  const totalReg = scoped.filter(e => e.category === 'Registration').reduce((s, e) => s + e.total, 0);
  const totalExpenses = scoped.reduce((s, e) => s + e.total, 0);
  const totalReceiptsAttached = scoped.filter(e => e.attachmentUrl || e.attachmentName || ['Fuel', 'Insurance', 'Registration'].includes(e.category)).length;

  const columns: Column<VehicleExpense>[] = [
    {
      key: 'expenseNumber',
      header: 'Expense # / Plate',
      render: (e) => (
        <div className="cursor-pointer" onClick={() => openVehicleDetail(e.vehicleId, 'expenses')}>
          <span className="font-mono font-bold text-slate-100 hover:text-[#086343] transition-colors">{e.expenseNumber}</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono font-bold text-[10px]">
              {e.vehiclePlate}
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
          <p className="text-[10px] text-slate-400">Supplier: {e.supplierName || 'Fleet Operations'}</p>
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
      render: (e) => {
        const hasDoc = e.attachmentUrl || e.attachmentName || ['Fuel', 'Insurance', 'Registration'].includes(e.category);
        const receiptUrl = e.attachmentUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80';
        const receiptTitle = e.attachmentName || `${e.expenseNumber}_${e.category}_Receipt.pdf`;

        return hasDoc ? (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              openBillModal(receiptUrl, receiptTitle, 'application/pdf', '890 KB');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCEFE5] text-[#06452F] hover:bg-[#bde2d0] text-[10px] font-bold transition-colors cursor-pointer group"
            title="View Scanned Receipt / Entry Bill"
          >
            <Paperclip className="w-3 h-3 text-[#086343] group-hover:scale-110 transition-transform" />
            <span>View Voucher</span>
          </button>
        ) : (
          <span className="text-[10px] text-slate-400 italic">None</span>
        );
      },
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Vehicle Expenses & Entry Bills Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Track categorized fuel, insurance, registrations, permits, and entry bill vouchers with scanned receipt document uploads.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={() => openQuickModal('add-expense')}
            leftIcon={<UploadCloud className="w-4 h-4 text-[#086343]" />}
          >
            Upload Entry Bill
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-expense')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Fuel Spend"
          value={formatCurrency(totalFuel, currency)}
          subValue="Fleet card consumption"
          isHero={true}
        />
        <StatCard
          title="Insurance Premiums"
          value={formatCurrency(totalInsurance, currency)}
          subValue="Annual policies"
        />
        <StatCard
          title="Mulkiya Registration"
          value={formatCurrency(totalReg, currency)}
          subValue="Royal Oman Police fees"
        />
        <StatCard
          title="Total Fleet Expenses"
          value={formatCurrency(totalExpenses, currency)}
          subValue={`${totalReceiptsAttached} receipts uploaded`}
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredExpenses}
        columns={columns}
        keyExtractor={e => e.id}
        title="Vehicle Operational Expenses Registry"
        searchPlaceholder="Search expenses by expense number, plate, category, vendor or cost centre..."
        searchFields={['expenseNumber', 'vehiclePlate', 'category', 'description', 'vendorName', 'costCentre']}
        exportFilename="FleetX_Expenses_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Expense Categories</option>
              <option value="Fuel">Fuel (M91 / M95 / Diesel)</option>
              <option value="Insurance">Insurance Policies</option>
              <option value="Registration">Mulkiya & ROP Fees</option>
              <option value="Tolls">Tolls & Salik</option>
              <option value="Cleaning">Washing & Detailing</option>
              <option value="Other">Other Operational</option>
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
          </div>
        }
      />
    </div>
  );
};
