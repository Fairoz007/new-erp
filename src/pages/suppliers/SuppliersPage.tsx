import React from 'react';
import { Truck, Plus, Phone, Mail, MapPin, CreditCard, Building2 } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Supplier } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';

export const SuppliersPage: React.FC = () => {
  const { suppliers, currency } = useFleet();
  const { openQuickModal } = useUI();

  const totalSuppliers = suppliers.length;
  const totalPurchases = suppliers.reduce((s, sup) => s + sup.totalPurchases, 0);
  const totalOutstandingAP = suppliers.reduce((s, sup) => s + sup.currentBalance, 0);

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier / ID',
      render: (s) => (
        <div>
          <span className="font-bold text-slate-100">{s.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono text-forest-700 font-semibold px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700">
              {s.supplierId}
            </span>
            <span className="text-[10px] text-slate-400">• {s.supplierType}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Person & Phone',
      render: (s) => (
        <div>
          <p className="text-slate-200">{s.contactPerson}</p>
          <p className="text-[11px] text-slate-400">{s.phone}</p>
        </div>
      ),
    },
    {
      key: 'vatNumber',
      header: 'VAT Number',
      render: (s) => <span className="font-mono text-slate-300 text-xs">{s.vatNumber || '-'}</span>,
    },
    {
      key: 'paymentTermsDays',
      header: 'Payment Terms',
      render: (s) => <span className="text-slate-300">{s.paymentTermsDays} Days Net</span>,
    },
    {
      key: 'totalPurchases',
      header: 'Total Purchases',
      align: 'right',
      render: (s) => (
        <div className="text-right">
          <span className="font-semibold text-slate-200">{formatCurrency(s.totalPurchases, currency)}</span>
          <p className="text-[10px] text-slate-500">{s.totalInvoicesCount} Invoices</p>
        </div>
      ),
    },
    {
      key: 'currentBalance',
      header: 'Outstanding (AP)',
      align: 'right',
      render: (s) => (
        <div className="text-right">
          <span className={`font-bold ${s.currentBalance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {formatCurrency(s.currentBalance, currency)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (s) => <StatusBadge status={s.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Suppliers & Vendors Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Manage authorized vehicle dealers, workshops, tyre suppliers, oil companies, and spare parts vendors with AP balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="rounded-full shadow-sm"
            onClick={() => openQuickModal('add-supplier')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Supplier
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Suppliers"
          value={totalSuppliers}
          subValue="Registered vendor partners"
          icon={<Truck className="w-4 h-4" />}
          variant="indigo"
          isHero={true}
        />
        <StatCard
          title="Cumulative Purchases YTD"
          value={formatCurrency(totalPurchases, currency)}
          subValue="Parts, tyres, fuel & vehicles"
          icon={<CreditCard className="w-4 h-4" />}
          variant="blue"
        />
        <StatCard
          title="Accounts Payable (AP)"
          value={formatCurrency(totalOutstandingAP, currency)}
          subValue="Outstanding vendor invoices"
          icon={<Truck className="w-4 h-4" />}
          variant="amber"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={suppliers}
        columns={columns}
        keyExtractor={s => s.id}
        title="Supplier Database"
        searchPlaceholder="Search suppliers by name, type, contact person, VAT number..."
        searchFields={['name', 'supplierType', 'contactPerson', 'phone', 'vatNumber']}
        exportFilename="FleetX_Suppliers_Directory"
      />
    </div>
  );
};
