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

  const scoped = invoices.filter(inv => !selectedCompanyId || selectedCompanyId === 'all' || inv.companyId === selectedCompanyId);
  const totalPurchaseAmount = scoped.filter(i => i.invoiceType === 'Purchase').reduce((s, i) => s + i.grandTotal, 0);
  const totalSalesAmount = scoped.filter(i => i.invoiceType === 'Sales').reduce((s, i) => s + i.grandTotal, 0);
  const totalOutstandingAP = scoped.filter(i => i.invoiceType === 'Purchase').reduce((s, i) => s + i.outstandingAmount, 0);
  const totalOutstandingAR = scoped.filter(i => i.invoiceType === 'Sales').reduce((s, i) => s + i.outstandingAmount, 0);
  const totalWithBills = scoped.filter(i => i.attachmentUrl || i.attachmentName || i.invoiceType === 'Purchase').length;

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
        const hasDoc = inv.attachmentUrl || inv.attachmentName || inv.invoiceType === 'Purchase';
        const docUrl = inv.attachmentUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80';
        const docName = inv.attachmentName || `${inv.invoiceNumber}_Scanned_Supplier_Bill.pdf`;

        return hasDoc ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openBillModal(docUrl, docName, inv.attachmentType || 'application/pdf', inv.attachmentSize || '1.4 MB');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCEFE5] text-[#06452F] hover:bg-[#bde2d0] text-[10px] font-bold transition-colors cursor-pointer group"
            title="View Scanned Purchase Bill"
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
          <p className="text-[10px] text-slate-400 font-medium">VAT (5%): {formatCurrency(inv.taxTotal, inv.currency)}</p>
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
      render: (inv) => <StatusBadge status={inv.paymentStatus} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (inv) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          {(inv.attachmentUrl || inv.attachmentName || inv.invoiceType === 'Purchase') && <Button
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
            Supplier purchase bills with document scan upload, customer invoicing, 5% VAT calculations, and interactive bill preview.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={() => openQuickModal('add-invoice')}
            leftIcon={<UploadCloud className="w-4 h-4 text-[#086343]" />}
          >
            Upload Bill
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-invoice')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Invoice
          </Button>
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
          subValue="Immediate collection required"
          trend={{ value: 'Critical', direction: 'down' }}
        />
        <StatCard
          title="Scanned Bills Attached"
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
            </select>
            <select
              value={attachmentFilter}
              onChange={e => setAttachmentFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
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
