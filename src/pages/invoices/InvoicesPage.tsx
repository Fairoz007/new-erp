import React, { useState } from 'react';
import { Plus, Printer, Paperclip, Eye, Wallet } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Invoice } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const InvoicesPage: React.FC = () => {
  const { invoices, selectedCompanyId, currency } = useFleet();
  const { openQuickModal, openInvoiceModal, openBillModal, invoiceView, setInvoiceView, openPaymentFor } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'invoices');
  const canPay = hasPermission('create', 'payments');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [attachmentFilter, setAttachmentFilter] = useState<string>('all');

  // A pending invoice is posted (approved), not cancelled, and still has a balance to settle
  const isPending = (i: Invoice) =>
    i.approvalStatus === 'Approved' && !i.isCreditNote && i.paymentStatus !== 'Cancelled' && i.paymentStatus !== 'Paid' && i.outstandingAmount > 0.0005;

  const filteredInvoices = invoices.filter(inv => {
    if (invoiceView === 'pending' && !isPending(inv)) return false;
    if (invoiceView === 'overdue' && inv.paymentStatus !== 'Overdue') return false;
    if (invoiceView === 'approval' && inv.approvalStatus !== 'Pending Approval') return false;
    if (invoiceView === 'draft' && inv.approvalStatus !== 'Draft') return false;
    if (invoiceView === 'paid' && inv.paymentStatus !== 'Paid') return false;
    if (selectedCompanyId && selectedCompanyId !== 'all' && inv.companyId !== selectedCompanyId) return false;
    if (typeFilter !== 'all' && inv.invoiceType !== typeFilter) return false;
    if (statusFilter !== 'all' && inv.paymentStatus !== statusFilter) return false;
    if (approvalFilter !== 'all' && inv.approvalStatus !== approvalFilter) return false;
    if (attachmentFilter === 'with-attachment' && !inv.attachmentUrl) return false;
    if (attachmentFilter === 'no-attachment' && inv.attachmentUrl) return false;
    return true;
  });

  const scoped = invoices.filter(inv => !selectedCompanyId || selectedCompanyId === 'all' || inv.companyId === selectedCompanyId);
  // AP/AR figures use posted (Approved) documents only; credit notes carry negative totals
  const posted = scoped.filter(i => i.approvalStatus === 'Approved');
  const totalPurchaseAmount = posted.filter(i => i.invoiceType === 'Purchase').reduce((s, i) => s + i.grandTotal, 0);
  const totalSalesAmount = posted.filter(i => i.invoiceType === 'Sales').reduce((s, i) => s + i.grandTotal, 0);
  const totalOutstandingAP = posted.filter(i => i.invoiceType === 'Purchase').reduce((s, i) => s + i.outstandingAmount, 0);
  const totalOutstandingAR = posted.filter(i => i.invoiceType === 'Sales').reduce((s, i) => s + i.outstandingAmount, 0);
  // Only documents with a stored file count (no assumed scans for purchase invoices)
  const totalWithBills = scoped.filter(i => i.attachmentUrl).length;
  const awaitingApproval = scoped.filter(i => i.approvalStatus === 'Pending Approval').length;

  // Pending balances bucketed by days past due, AP and AR separately
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const BUCKETS = ['Not yet due', '1-30 days', '31-60 days', '61-90 days', '90+ days'];
  const bucketOf = (due: string) => {
    const days = Math.floor((todayMs - new Date(due).getTime()) / 86_400_000);
    return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
  };
  const pendingAll = scoped.filter(isPending);
  const aging = (type: 'Purchase' | 'Sales') => {
    const sums = [0, 0, 0, 0, 0];
    pendingAll.filter(i => i.invoiceType === type).forEach(i => { sums[bucketOf(i.dueDate)] += i.outstandingAmount; });
    return sums;
  };
  const agingAP = aging('Purchase');
  const agingAR = aging('Sales');
  const pendingCount = pendingAll.length;
  const pendingByParty = Object.values(pendingAll.reduce<Record<string, { name: string; type: string; count: number; total: number }>>((acc, i) => {
    const k = `${i.invoiceType}:${i.partyId}`;
    (acc[k] ??= { name: i.partyName, type: i.invoiceType === 'Purchase' ? 'Supplier' : 'Customer', count: 0, total: 0 });
    acc[k].count += 1; acc[k].total += i.outstandingAmount;
    return acc;
  }, {})).sort((a, b) => b.total - a.total).slice(0, 8);
  const VIEWS: { id: typeof invoiceView; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: scoped.length },
    { id: 'pending', label: 'Pending Payment', count: pendingCount },
    { id: 'overdue', label: 'Overdue', count: scoped.filter(i => i.paymentStatus === 'Overdue').length },
    { id: 'approval', label: 'Awaiting Approval', count: awaitingApproval },
    { id: 'draft', label: 'Drafts', count: scoped.filter(i => i.approvalStatus === 'Draft').length },
    { id: 'paid', label: 'Paid', count: scoped.filter(i => i.paymentStatus === 'Paid').length },
  ];

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice # / Ref',
      render: (inv) => (
        <div className="cursor-pointer" onClick={() => openInvoiceModal(inv.id)}>
          <span className="font-mono font-bold text-slate-100 hover:text-[#086343] transition-colors">{inv.invoiceNumber}</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inv.invoiceType === 'Sales' ? 'bg-[#DCEFE5] text-[#06452F]' : 'bg-[#DBEAFE] text-[#1E40AF]'}`}>
              {inv.invoiceType}
            </span>
            {inv.isCreditNote && <span className="text-[10px] text-rose-600 font-bold">Credit Note</span>}
            {inv.referenceNumber && <span className="text-[10px] text-slate-400 font-mono">Ref: {inv.referenceNumber}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'partyName',
      header: 'Billed To / From',
      render: (inv) => (
        <div>
          <p className="font-bold text-slate-200">{inv.partyName}</p>
          <p className="text-[10px] text-slate-400 font-medium">{inv.partyType} • {inv.paymentTermsDays} Days</p>
        </div>
      ),
    },
    {
      key: 'invoiceDate',
      header: 'Date & Due',
      render: (inv) => (
        <div>
          <span className="text-slate-300 font-medium">{formatDate(inv.invoiceDate)}</span>
          <p className={`text-[10px] font-semibold ${inv.paymentStatus === 'Overdue' ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
            Due: {formatDate(inv.dueDate)}
          </p>
        </div>
      ),
    },
    {
      key: 'attachmentUrl',
      header: 'Bill Document',
      render: (inv) => {
        // attachmentUrl is a storage://documents/<path> reference resolved to a signed URL by the viewer
        return inv.attachmentUrl ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openBillModal(inv.attachmentUrl!, inv.attachmentName || inv.invoiceNumber, inv.attachmentType, inv.attachmentSize);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCEFE5] text-[#06452F] hover:bg-[#bde2d0] text-[10px] font-bold transition-colors cursor-pointer group"
            title="View attached bill"
          >
            <Paperclip className="w-3 h-3 text-[#086343] group-hover:scale-110 transition-transform" />
            <span>View Bill</span>
          </button>
        ) : (
          <span className="text-[10px] text-slate-400 italic">None</span>
        );
      },
    },
    {
      key: 'grandTotal',
      header: 'Total Amount',
      align: 'right',
      render: (inv) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(inv.grandTotal, inv.currency)}</span>
          <p className="text-[10px] text-slate-400 font-medium">VAT: {formatCurrency(inv.taxTotal, inv.currency)}</p>
        </div>
      ),
    },
    {
      key: 'outstandingAmount',
      header: 'Balance Due',
      align: 'right',
      render: (inv) => (
        <div className="text-right">
          <span className={`font-bold ${inv.outstandingAmount > 0 ? 'text-[#D9A441]' : 'text-[#086343]'}`}>
            {formatCurrency(inv.outstandingAmount, inv.currency)}
          </span>
          {inv.amountPaid > 0 && <p className="text-[10px] text-slate-400">Paid: {formatCurrency(inv.amountPaid, inv.currency)}</p>}
        </div>
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Status',
      align: 'center',
      render: (inv) => (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge status={inv.paymentStatus} size="sm" />
          {inv.approvalStatus !== 'Approved' && (
            <span className="text-[10px] font-semibold text-slate-400">{inv.approvalStatus}</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (inv) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          {inv.attachmentUrl && <Button
            variant="ghost"
            size="xs"
            onClick={() => openBillModal(inv.attachmentUrl!, inv.attachmentName || inv.invoiceNumber, inv.attachmentType, inv.attachmentSize)}
            leftIcon={<Eye className="w-3 h-3" />}
          >
            Bill
          </Button>}
          {canPay && isPending(inv) && (
            <Button variant="secondary" size="xs" onClick={() => openPaymentFor(inv.id)} leftIcon={<Wallet className="w-3 h-3" />}>
              {inv.invoiceType === 'Purchase' ? 'Pay' : 'Receive'}
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => openInvoiceModal(inv.id)} leftIcon={<Printer className="w-3 h-3" />}>
            Print
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
            Invoice & Purchase Bill Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Supplier purchase bills and customer invoices. Totals and VAT are calculated from the invoice lines; invoices reach the ledger when approved.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canCreate && <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-invoice')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Invoice
          </Button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Supplier Payables (AP)"
          value={formatCurrency(totalOutstandingAP, currency)}
          subValue={`Total Invoiced: ${formatCurrency(totalPurchaseAmount, currency)}`}
          isHero={true}
        />
        <StatCard
          title="Customer Receivables (AR)"
          value={formatCurrency(totalOutstandingAR, currency)}
          subValue={`Total Billed: ${formatCurrency(totalSalesAmount, currency)}`}
        />
        <StatCard
          title="Overdue Invoices"
          value={scoped.filter(i => i.paymentStatus === 'Overdue').length}
          subValue={`${awaitingApproval} invoice(s) awaiting approval`}
        />
        <StatCard
          title="Bills With Attachment"
          value={totalWithBills}
          subValue={`${scoped.length} total register entries`}
        />
      </div>

      {/* Pending invoices: view tabs, ageing and biggest open balances */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Invoice views">
        {VIEWS.map(v => (
          <button
            key={v.id}
            role="tab"
            aria-selected={invoiceView === v.id}
            onClick={() => setInvoiceView(v.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
              invoiceView === v.id ? 'bg-[#086343] text-white border-[#086343]' : 'bg-white text-slate-300 border-slate-700 hover:bg-slate-850'
            }`}
          >
            {v.label} <span className="opacity-70">({v.count})</span>
          </button>
        ))}
      </div>

      {(invoiceView === 'pending' || invoiceView === 'overdue') && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white border border-slate-700 rounded-2xl p-4 overflow-x-auto">
            <h3 className="text-sm font-bold text-slate-100 mb-3">Pending balances by age ({pendingCount} invoice{pendingCount === 1 ? '' : 's'})</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-1.5 font-semibold">Ledger</th>
                  {BUCKETS.map(b => <th key={b} className="py-1.5 font-semibold text-right">{b}</th>)}
                  <th className="py-1.5 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {([['Payables (suppliers)', agingAP], ['Receivables (customers)', agingAR]] as [string, number[]][]).map(([label, row]) => (
                  <tr key={label} className="border-t border-slate-700/60">
                    <td className="py-2 font-semibold text-slate-200">{label}</td>
                    {row.map((v, i) => (
                      <td key={i} className={`py-2 text-right ${i >= 3 && v > 0 ? 'text-rose-600 font-bold' : 'text-slate-300'}`}>{formatCurrency(v, currency)}</td>
                    ))}
                    <td className="py-2 text-right font-bold text-slate-100">{formatCurrency(row.reduce((a, b) => a + b, 0), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white border border-slate-700 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-slate-100 mb-3">Largest open balances</h3>
            {pendingByParty.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing pending. All posted invoices are settled.</p>
            ) : (
              <ul className="space-y-2">
                {pendingByParty.map(p => (
                  <li key={`${p.type}-${p.name}`} className="flex items-center justify-between text-xs">
                    <span className="min-w-0"><span className="font-semibold text-slate-200 truncate block">{p.name}</span><span className="text-slate-400">{p.type} · {p.count} invoice{p.count === 1 ? '' : 's'}</span></span>
                    <span className="font-bold text-[#D9A441] shrink-0 ml-3">{formatCurrency(p.total, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* DataTable */}
      <DataTable
        data={filteredInvoices}
        columns={columns}
        keyExtractor={i => i.id}
        title="Invoices & Purchase Bills Registry"
        searchPlaceholder="Search invoices by invoice number, party name, reference..."
        searchFields={['invoiceNumber', 'partyName', 'referenceNumber', 'purchaseOrderNumber', 'vehiclePlate']}
        exportFilename="FleetX_Invoices_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Types (AP & AR)</option>
              <option value="Purchase">Purchase Bills (Suppliers)</option>
              <option value="Sales">Sales Invoices (Customers)</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Payment Statuses</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Overdue">Overdue</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              value={approvalFilter}
              onChange={e => setApprovalFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Approval States</option>
              <option value="Draft">Draft</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Approved">Approved (posted)</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              value={attachmentFilter}
              onChange={e => setAttachmentFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Attachments</option>
              <option value="with-attachment">With Attachment</option>
              <option value="no-attachment">No Attachment</option>
            </select>
          </div>
        }
      />
    </div>
  );
};
