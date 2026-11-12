import React, { useState } from 'react';
import { Truck, Plus, Phone, Mail, MapPin, CreditCard, Building2, Eye } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Supplier } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { PartyEditModal } from './PartyEditModal';
import { PartyImportModal, exportPartiesCsv } from '../parties/PartyCsv';
import { Download, Upload, Clock } from 'lucide-react';
import { Pencil, Power } from 'lucide-react';
import { formatCurrency } from '../../utils/financial';
import { partyAvailableIn } from '../../services/finance';
import { Badge } from '../../components/ui/Badge';
import { SHARING_LABEL } from '../../components/common/PartyOfficeFields';
import { PartySharingModal } from '../../components/common/PartySharingModal';
import { TransferOfficeModal } from '../../components/common/TransferOfficeModal';
import { ArrowRightLeft, Share2 } from 'lucide-react';
import { useCustomFields, useCustomFieldFilter, withCustomColumns } from '../../hooks/useCustomFields';

export const SuppliersPage: React.FC = () => {
  const { suppliers: allSuppliers, currency, updateSupplier, companies, selectedCompanyId } = useFleet();
  const { openQuickModal, addToast, openPartyDetail } = useUI();
  const { hasPermission } = useAuth();
  const canEditIn = (officeId: string) => hasPermission('edit', 'suppliers', officeId);
  const canTransfer = (officeId: string) => canEditIn(officeId) && companies.some(o => o.id !== officeId && hasPermission('create', 'suppliers', o.id));
  const officeName = (id: string) => companies.find(o => o.id === id)?.name ?? '—';
  // "All offices" shows everything the user can see; one office shows what that office may use.
  const suppliers = selectedCompanyId === 'all' ? allSuppliers : allSuppliers.filter(p => partyAvailableIn(p, selectedCompanyId));
  const [sharing, setSharing] = useState<Supplier | null>(null);
  const [moving, setMoving] = useState<Supplier | null>(null);
  const canCreate = hasPermission('create', 'suppliers');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [regFilter, setRegFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [importing, setImporting] = useState(false);
  const canImport = companies.some(o => hasPermission('create', 'suppliers', o.id));
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
        <div className="cursor-pointer group" onClick={() => openPartyDetail('supplier', s.id)}>
          <span className="font-bold text-slate-100 group-hover:text-forest-400 transition-colors">{s.name}</span>
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
      key: 'officeId',
      header: 'Office',
      render: (s) => (
        <div>
          <p className="text-slate-200 text-xs font-semibold">{officeName(s.officeId)}</p>
          <Badge variant={s.sharing === 'office' ? 'slate' : 'emerald'}>
            {s.sharing === 'selected' ? `+${s.sharedOfficeIds.length} office${s.sharedOfficeIds.length === 1 ? '' : 's'}` : SHARING_LABEL[s.sharing]}
          </Badge>
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
      render: (s) => (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge status={s.status} size="sm" />
          {s.registration.status !== 'Approved' && (
            <Badge variant={s.registration.status === 'Pending' ? 'amber' : 'rose'} title={s.registration.note || undefined}>
              {s.registration.status === 'Pending' ? 'Awaiting approval' : 'Rejected'}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      sortable: false,
      render: (s: Supplier) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => openPartyDetail('supplier', s.id)} leftIcon={<Eye className="w-3 h-3" />}>
            Details
          </Button>
          {canEditIn(s.officeId) && (
            <>
              <Button variant="ghost" size="xs" onClick={() => setSharing(s)} leftIcon={<Share2 className="w-3 h-3" />}>
                Sharing
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setEditing(s)} leftIcon={<Pencil className="w-3 h-3" />}>
                Edit
              </Button>
              <Button variant="ghost" size="xs" onClick={() => toggleActive(s)} disabled={busyId === s.id}
                isLoading={busyId === s.id} leftIcon={<Power className="w-3 h-3" />}>
                {s.status === 'Active' ? 'Deactivate' : 'Activate'}
              </Button>
            </>
          )}
          {canTransfer(s.officeId) && (
            <Button variant="ghost" size="xs" onClick={() => setMoving(s)} leftIcon={<ArrowRightLeft className="w-3 h-3" />}>
              Transfer
            </Button>
          )}
        </div>
      ),
    },
  ];

  // custom fields: list columns, search and filter (Settings → Custom fields)
  const cfList = useCustomFields('supplier');
  const { filtered: cfRows, ui: cfFilter } = useCustomFieldFilter(cfList.defs, regFilter === 'all' ? suppliers : suppliers.filter(p => p.registration.status === regFilter));
  const pendingCount = suppliers.filter(p => p.registration.status === 'Pending').length;
  const officeCode = (id: string) => companies.find(o => o.id === id)?.code ?? '';
  const regSelect = (
    <select aria-label="Registration status" value={regFilter} onChange={e => setRegFilter(e.target.value as typeof regFilter)}
      className="h-9 rounded-full border border-slate-700 bg-white px-3 text-xs text-slate-200">
      <option value="all">All registrations</option>
      <option value="Pending">Awaiting approval</option>
      <option value="Approved">Approved</option>
      <option value="Rejected">Rejected</option>
    </select>
  );

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

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => exportPartiesCsv('supplier', cfRows, cfList.defs, officeCode)}
            leftIcon={<Download className="w-4 h-4" />}>Export all fields</Button>
          {canImport && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setImporting(true)} leftIcon={<Upload className="w-4 h-4" />}>
              Import CSV
            </Button>
          )}
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

      {pendingCount > 0 && (
        <button type="button" onClick={() => setRegFilter('Pending')}
          className="w-full flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800">
          <Clock className="w-4 h-4 shrink-0" />
          {pendingCount} supplier registration{pendingCount === 1 ? ' is' : 's are'} waiting for approval. They cannot be used on invoices, bills or payments until approved. Show them
        </button>
      )}

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

      {/* Suppliers Table */}
      <DataTable
        data={cfRows}
        collection={'suppliers'}
        columns={withCustomColumns(columns, cfList.listColumns<Supplier>())}
        searchText={cfList.searchText}
        extraFilters={<>{regSelect}{cfFilter}</>}
        keyExtractor={s => s.id}
        title="Vendor Registry"
        searchPlaceholder="Search suppliers by name, ID, contact, phone, VAT number..."
        searchFields={['name', 'supplierId', 'contactPerson', 'phone', 'email', 'vatNumber', 'supplierType']}
        exportFilename="Suppliers"
      />

      <PartySharingModal type="Supplier" party={sharing} onClose={() => setSharing(null)} />
      <TransferOfficeModal entity="supplier" record={moving ? { id: moving.id, label: moving.name, officeId: moving.officeId } : null} onClose={() => setMoving(null)} />

      <PartyEditModal
        kind="supplier"
        party={editing}
        onClose={() => setEditing(null)}
        onSave={async (id, changes) => { await save(id, changes); }}
      />

      {importing && <PartyImportModal kind="supplier" onClose={() => setImporting(false)} />}
    </div>
  );
};
