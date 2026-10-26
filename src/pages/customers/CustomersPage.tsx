import React, { useState } from 'react';
import { Users, Plus, Phone, Mail, MapPin, DollarSign, CreditCard } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Customer } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { PartyEditModal } from '../suppliers/PartyEditModal';
import { Pencil, Power } from 'lucide-react';
import { formatCurrency } from '../../utils/financial';

export const CustomersPage: React.FC = () => {
  const { customers, currency, updateCustomer } = useFleet();
  const { openQuickModal, addToast } = useUI();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit', 'customers');
  const canCreate = hasPermission('create', 'customers');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const save = async (id: string, changes: Partial<Customer>) => {
    await updateCustomer(id, changes);
    addToast({ type: 'success', title: 'Customer Updated', message: 'Changes saved.' });
  };

  // Customers linked to invoices are never deleted: they are deactivated (status Inactive) instead.
  const toggleActive = async (c: Customer) => {
    const next = c.status === 'Active' ? 'Inactive' : 'Active';
    setBusyId(c.id);
    try {
      await updateCustomer(c.id, { status: next });
      addToast({ type: 'success', title: next === 'Active' ? 'Customer Activated' : 'Customer Deactivated', message: c.name });
    } catch (e) {
      addToast({ type: 'error', title: 'Update Failed', message: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  // Balances come from the database (posted invoices, payments and credit notes)
  const totalCustomers = customers.filter(c => c.status === 'Active').length;
  const totalSales = customers.reduce((s, c) => s + c.totalSales, 0);
  const totalOutstandingAR = customers.reduce((s, c) => s + c.currentBalance, 0);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer / Client',
      render: (c) => (
        <div>
          <span className="font-bold text-slate-100">{c.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono text-forest-700 font-semibold px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700">
              {c.customerId}
            </span>
            <span className="text-[10px] text-slate-400">• {c.customerType}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Person & Phone',
      render: (c) => (
        <div>
          <p className="text-slate-200">{c.contactPerson}</p>
          <p className="text-[11px] text-slate-400">{c.phone}</p>
        </div>
      ),
    },
    {
      key: 'paymentTermsDays',
      header: 'Payment Terms',
      render: (c) => <span className="text-slate-300">{c.paymentTermsDays} Days Net</span>,
    },
    {
      key: 'creditLimit',
      header: 'Credit Limit',
      align: 'right',
      render: (c) => <span className="font-mono text-slate-300">{formatCurrency(c.creditLimit, currency)}</span>,
    },
    {
      key: 'totalSales',
      header: 'Total Billings YTD',
      align: 'right',
      render: (c) => (
        <div className="text-right">
          <span className="font-semibold text-slate-200">{formatCurrency(c.totalSales, currency)}</span>
          <p className="text-[10px] text-slate-500">{c.totalInvoicesCount} Invoices</p>
        </div>
      ),
    },
    {
      key: 'currentBalance',
      header: 'Receivables (AR)',
      align: 'right',
      render: (c) => (
        <div className="text-right">
          <span className={`font-bold ${c.currentBalance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {formatCurrency(c.currentBalance, currency)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (c) => <StatusBadge status={c.status} size="sm" />,
    },
    ...(canEdit ? [{
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      sortable: false,
      render: (c: Customer) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => setEditing(c)} leftIcon={<Pencil className="w-3 h-3" />}>
            Edit
          </Button>
          <Button variant="ghost" size="xs" onClick={() => toggleActive(c)} disabled={busyId === c.id}
            isLoading={busyId === c.id} leftIcon={<Power className="w-3 h-3" />}>
            {c.status === 'Active' ? 'Deactivate' : 'Activate'}
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
            Customer Accounts & Billing
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Corporate clients, long-term concession transport contracts, rental agreements, and Accounts Receivable (AR).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && <Button
            variant="primary"
            size="sm"
            className="rounded-full shadow-sm"
            onClick={() => openQuickModal('add-customer')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Customer
          </Button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Customers"
          value={totalCustomers}
          subValue={`${customers.length} registered in total`}
          icon={<Users className="w-4 h-4" />}
          variant="indigo"
          isHero={true}
        />
        <StatCard
          title="Total Posted Billings"
          value={formatCurrency(totalSales, currency)}
          subValue="Approved sales invoices, all periods"
          icon={<DollarSign className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Accounts Receivable (AR)"
          value={formatCurrency(totalOutstandingAR, currency)}
          subValue="Outstanding customer invoices"
          icon={<CreditCard className="w-4 h-4" />}
          variant="blue"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={customers}
        columns={columns}
        keyExtractor={c => c.id}
        title="Customer Directory"
        searchPlaceholder="Search customers by company name, contact person, phone..."
        searchFields={['name', 'customerType', 'contactPerson', 'phone', 'vatNumber']}
        exportFilename="FleetX_Customers_Directory"
      />

      <PartyEditModal kind="customer" party={editing} onClose={() => setEditing(null)} onSave={save} />
    </div>
  );
};
