import React, { useState } from 'react';
import { Truck, Plus, Phone, Mail, MapPin, CreditCard, Building2 } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Supplier } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { PartyEditModal } from './PartyEditModal';
import { Pencil, Power } from 'lucide-react';
import { formatCurrency } from '../../utils/financial';

export const SuppliersPage: React.FC = () => {
  const { suppliers, currency, updateSupplier } = useFleet();
  const { openQuickModal, addToast } = useUI();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit', 'suppliers');
  const canCreate = hasPermission('create', 'suppliers');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const save = async (id: string, changes: Partial<Supplier>) => {
    await updateSupplier(id, changes);
    addToast({ type: 'success', title: 'Supplier Updated', message: 'Changes saved.' });
  };

  // Suppliers linked to invoices are never deleted: they are deactivated (status Inactive) instead.
  const toggleActive = async (s: Supplier) => {
    const next = s.status === 'Active' ? 'Inactive' : 'Active';
    setBusyId(s.id);
    try {
      await updateSupplier(s.id, { status: next });
      addToast({ type: 'success', title: next === 'Active' ? 'Supplier Activated' : 'Supplier Deactivated', message: s.name });
    } catch (e) {
      addToast({ type: 'error', title: 'Update Failed', message: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  // Balances come from the database (posted invoices, payments and credit notes)
  const activeSuppliers = suppliers.filter(s => s.status === 'Active').length;
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
    ...(canEdit ? [{
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      sortable: false,
      render: (s: Supplier) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => setEditing(s)} leftIcon={<Pencil className="w-3 h-3" />}>
            Edit
          </Button>
          <Button variant="ghost" size="xs" onClick={() => toggleActive(s)} disabled={busyId === s.id}
            isLoading={busyId === s.id} leftIcon={<Power className="w-3 h-3" />}>
            {s.status === 'Active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    }] : []),
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
          {canCreate && <Button
            variant="primary"
            size="sm"
            className="rounded-full shadow-sm"
            onClick={() => openQuickModal('add-supplier')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Supplier
          </Button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Suppliers"
          value={activeSuppliers}
          subValue={`${suppliers.length} registered in total`}
          icon={<Truck className="w-4 h-4" />}
          variant="indigo"
          isHero={true}
        />
        <StatCard
          title="Total Posted Purchases"
          value={formatCurrency(totalPurchases, currency)}
          subValue="Approved supplier invoices, all periods"
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

      <PartyEditModal kind="supplier" party={editing} onClose={() => setEditing(null)} onSave={save} />
    </div>
  );
};
