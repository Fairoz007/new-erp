import React, { useState } from 'react';
import { Plus, Printer, Paperclip, Eye } from 'lucide-react';
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
  const { openQuickModal, openInvoiceModal, openBillModal } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'invoices');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [attachmentFilter, setAttachmentFilter] = useState<string>('all');

  const filteredInvoices = invoices.filter(inv => {
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
