import React, { useState } from 'react';
import { FileText, Plus, Printer, Paperclip, UploadCloud, Eye, AlertTriangle, CreditCard, Sparkles } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Invoice } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const InvoicesPage: React.FC = () => {
  const { invoices, selectedCompanyId, currency } = useFleet();
  const { openQuickModal, openInvoiceModal, openBillModal } = useUI();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [attachmentFilter, setAttachmentFilter] = useState<string>('all');

  const filteredInvoices = invoices.filter(inv => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && inv.companyId !== selectedCompanyId) return false;
    if (typeFilter !== 'all' && inv.invoiceType !== typeFilter) return false;
    if (statusFilter !== 'all' && inv.paymentStatus !== statusFilter) return false;
    if (attachmentFilter === 'with-attachment' && !inv.attachmentUrl && !inv.attachmentName) return false;
    if (attachmentFilter === 'no-attachment' && (inv.attachmentUrl || inv.attachmentName)) return false;
    return true;
  });

  const totalPurchaseAmount = invoices.filter(i => i.invoiceType === 'Purchase').reduce((s, i) => s + i.grandTotal, 0);
  const totalSalesAmount = invoices.filter(i => i.invoiceType === 'Sales').reduce((s, i) => s + i.grandTotal, 0);
  const totalOutstandingAP = invoices.filter(i => i.invoiceType === 'Purchase').reduce((s, i) => s + i.outstandingAmount, 0);
  const totalOutstandingAR = invoices.filter(i => i.invoiceType === 'Sales').reduce((s, i) => s + i.outstandingAmount, 0);
  const totalWithBills = invoices.filter(i => i.attachmentUrl || i.attachmentName || i.invoiceType === 'Purchase').length;

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice # / Ref',
      render: (inv) => (
        <div className="cursor-pointer" onClick={() => openInvoiceModal(inv.id)}>
          <span className="font-mono font-bold text-slate-100 hover:text-indigo-400 transition-colors">{inv.invoiceNumber}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${inv.invoiceType === 'Sales' ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60' : 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/60'}`}>
              {inv.invoiceType}
            </span>
            {inv.isCreditNote && <span className="text-[10px] text-rose-400 font-semibold">Credit Note</span>}
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
          <p className="font-semibold text-slate-200">{inv.partyName}</p>
          <p className="text-[10px] text-slate-400">{inv.partyType} • {inv.paymentTermsDays} Days</p>
        </div>
      ),
    },
    {
      key: 'invoiceDate',
      header: 'Date & Due',
      render: (inv) => (
        <div>
          <span className="text-slate-300">{formatDate(inv.invoiceDate)}</span>
          <p className={`text-[10px] ${inv.paymentStatus === 'Overdue' ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
            Due: {formatDate(inv.dueDate)}
          </p>
        </div>
      ),
    },
    {
      key: 'attachment',
      header: 'Uploaded Bill',
      align: 'center',
      render: (inv) => {
        const hasDoc = !!inv.attachmentUrl || !!inv.attachmentName || inv.invoiceType === 'Purchase';
        const docUrl = inv.attachmentUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80';
        const docName = inv.attachmentName || `${inv.invoiceNumber}_Scanned_Supplier_Bill.pdf`;

        return hasDoc ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openBillModal(docUrl, docName, inv.attachmentType || 'application/pdf', inv.attachmentSize || '1.4 MB');
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900 text-[10px] font-semibold transition-colors cursor-pointer group"
            title="View Scanned Purchase Bill"
          >
            <Paperclip className="w-3 h-3 text-indigo-400 group-hover:scale-110 transition-transform" />
            <span>View Bill</span>
          </button>
        ) : (
          <span className="text-[10px] text-slate-500 italic">None</span>
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
          <p className="text-[10px] text-slate-400">VAT (5%): {formatCurrency(inv.taxTotal, inv.currency)}</p>
        </div>
      ),
    },
    {
      key: 'outstandingAmount',
      header: 'Balance Due',
      align: 'right',
      render: (inv) => (
        <div className="text-right">
          <span className={`font-bold ${inv.outstandingAmount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
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
      render: (inv) => <StatusBadge status={inv.paymentStatus} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (inv) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              const docUrl = inv.attachmentUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80';
              const docName = inv.attachmentName || `${inv.invoiceNumber}_Scanned_Supplier_Bill.pdf`;
              openBillModal(docUrl, docName, 'application/pdf', '1.4 MB');
            }}
            leftIcon={<Eye className="w-3 h-3" />}
          >
            Bill
          </Button>
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
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-indigo-400" />
            <span>Invoice & Purchase Bill Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Supplier purchase bills with document scan upload, customer invoicing, 5% VAT calculations, and interactive bill preview.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openQuickModal('add-invoice')}
            leftIcon={<UploadCloud className="w-4 h-4 text-indigo-400" />}
          >
            Upload Purchase Bill
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-invoice')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Invoice
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Supplier Payables (AP)"
          value={formatCurrency(totalOutstandingAP, currency)}
          subValue={`Total Invoiced: ${formatCurrency(totalPurchaseAmount, currency)}`}
          icon={<FileText className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Customer Receivables (AR)"
          value={formatCurrency(totalOutstandingAR, currency)}
          subValue={`Total Billed: ${formatCurrency(totalSalesAmount, currency)}`}
          icon={<FileText className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Overdue Invoices"
          value={invoices.filter(i => i.paymentStatus === 'Overdue').length}
          subValue="Action required"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Scanned Bills Attached"
          value={totalWithBills}
          subValue={`${invoices.length} total records`}
          icon={<Paperclip className="w-4 h-4" />}
          variant="indigo"
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
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Types (AP & AR)</option>
              <option value="Purchase">Purchase Bills (Suppliers)</option>
              <option value="Sales">Sales Invoices (Customers)</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Payment Statuses</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Overdue">Overdue</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
            </select>
            <select
              value={attachmentFilter}
              onChange={e => setAttachmentFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Attachments</option>
              <option value="with-attachment">Attached Bill Scans</option>
              <option value="no-attachment">No Bill Scan</option>
            </select>
          </div>
        }
      />
    </div>
  );
};
