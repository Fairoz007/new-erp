import React, { useState } from 'react';
import { Users, Plus, Phone, Mail, MapPin, DollarSign, CreditCard, Eye } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Customer } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { PartyEditModal } from '../suppliers/PartyEditModal';
import { CustomerDetailModal } from './CustomerDetailModal';
import { Pencil, Power } from 'lucide-react';
import { formatCurrency } from '../../utils/financial';
import { partyAvailableIn } from '../../services/finance';
import { Badge } from '../../components/ui/Badge';
import { SHARING_LABEL } from '../../components/common/PartyOfficeFields';
import { PartySharingModal } from '../../components/common/PartySharingModal';
import { TransferOfficeModal } from '../../components/common/TransferOfficeModal';
import { ArrowRightLeft, Share2 } from 'lucide-react';
import { useCustomFields, useCustomFieldFilter, withCustomColumns } from '../../hooks/useCustomFields';

export const CustomersPage: React.FC = () => {
  const { customers: allCustomers, currency, updateCustomer, companies, selectedCompanyId } = useFleet();
  const { openQuickModal, addToast } = useUI();
  const { hasPermission } = useAuth();
  const canEditIn = (officeId: string) => hasPermission('edit', 'customers', officeId);
  const canTransfer = (officeId: string) => canEditIn(officeId) && companies.some(o => o.id !== officeId && hasPermission('create', 'customers', o.id));
  const officeName = (id: string) => companies.find(o => o.id === id)?.name ?? '—';
  // "All offices" shows everything the user can see; one office shows what that office may use.
  const customers = selectedCompanyId === 'all' ? allCustomers : allCustomers.filter(p => partyAvailableIn(p, selectedCompanyId));
  const [sharing, setSharing] = useState<Customer | null>(null);
  const [moving, setMoving] = useState<Customer | null>(null);
  const canCreate = hasPermission('create', 'customers');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
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
        <div className="cursor-pointer group" onClick={() => setViewingCustomer(c)}>
          <span className="font-bold text-slate-100 group-hover:text-forest-400 transition-colors">{c.name}</span>
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
      key: 'officeId',
      header: 'Office',
      render: (c) => (
        <div>
          <p className="text-slate-200 text-xs font-semibold">{officeName(c.officeId)}</p>
          <Badge variant={c.sharing === 'office' ? 'slate' : 'emerald'}>
            {c.sharing === 'selected' ? `+${c.sharedOfficeIds.length} office${c.sharedOfficeIds.length === 1 ? '' : 's'}` : SHARING_LABEL[c.sharing]}
          </Badge>
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
          <span className={`font-bold ${c.currentBalance > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
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
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      sortable: false,
      render: (c: Customer) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => setViewingCustomer(c)} leftIcon={<Eye className="w-3 h-3" />}>
            Details
          </Button>
          {canEditIn(c.officeId) && (
            <>
              <Button variant="ghost" size="xs" onClick={() => setSharing(c)} leftIcon={<Share2 className="w-3 h-3" />}>
                Sharing
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setEditing(c)} leftIcon={<Pencil className="w-3 h-3" />}>
                Edit
              </Button>
              <Button variant="ghost" size="xs" onClick={() => toggleActive(c)} disabled={busyId === c.id}
                isLoading={busyId === c.id} leftIcon={<Power className="w-3 h-3" />}>
                {c.status === 'Active' ? 'Deactivate' : 'Activate'}
              </Button>
            </>
          )}
          {canTransfer(c.officeId) && (
            <Button variant="ghost" size="xs" onClick={() => setMoving(c)} leftIcon={<ArrowRightLeft className="w-3 h-3" />}>
              Transfer
            </Button>
          )}
        </div>
      ),
    },
  ];

  // custom fields: list columns, search and filter (Settings → Custom fields)
  const cfList = useCustomFields('client');
  const { filtered: cfRows, ui: cfFilter } = useCustomFieldFilter(cfList.defs, customers);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Customer Accounts & Client Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Commercial fleet clients, contract terms, credit limits and accounts receivable (AR).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Button
              variant="primary"
              size="sm"
              className="rounded-full shadow-sm"
              onClick={() => openQuickModal('add-customer')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Customer
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Corporate Clients"
          value={totalCustomers}
          subValue={`${customers.length} total registered accounts`}
          icon={<Users className="w-4 h-4" />}
          variant="indigo"
          isHero={true}
        />
        <StatCard
          title="Total Billed Revenue"
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

      {/* Customers Table */}
      <DataTable
        data={cfRows}
        collection={'customers'}
        columns={withCustomColumns(columns, cfList.listColumns<Customer>())}
        searchText={cfList.searchText}
        extraFilters={cfFilter}
        keyExtractor={c => c.id}
        title="Customer Master Registry"
        searchPlaceholder="Search customers by name, ID, contact, phone, VAT number..."
        searchFields={['name', 'customerId', 'contactPerson', 'phone', 'email', 'vatNumber', 'customerType']}
        exportFilename="Customers"
      />

      <PartySharingModal type="Customer" party={sharing} onClose={() => setSharing(null)} />
      <TransferOfficeModal entity="client" record={moving ? { id: moving.id, label: moving.name, officeId: moving.officeId } : null} onClose={() => setMoving(null)} />

      <PartyEditModal
        kind="customer"
        party={editing}
        onClose={() => setEditing(null)}
        onSave={async (id, changes) => { await save(id, changes); }}
      />

      <CustomerDetailModal
        isOpen={!!viewingCustomer}
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        onEdit={c => setEditing(c)}
      />
    </div>
  );
};
