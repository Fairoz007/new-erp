import React from 'react';
import { Truck, Phone, Mail, MapPin, Building2, CreditCard, FileText, DollarSign, Calendar, ExternalLink, Pencil } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Supplier } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { TransferHistory } from '../../components/common/TransferOfficeModal';
import { SHARING_LABEL } from '../../components/common/PartyOfficeFields';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

interface SupplierDetailModalProps {
  supplier: Supplier | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (supplier: Supplier) => void;
}

export const SupplierDetailModal: React.FC<SupplierDetailModalProps> = ({
  supplier,
  isOpen,
  onClose,
  onEdit,
}) => {
  const { invoices, payments, currency, companies } = useFleet();
  const { openInvoiceModal, openBillModal, setCurrentPage, openQuickModal } = useUI();

  if (!supplier) return null;

  const supplierInvoices = invoices.filter(
    i => i.partyType === 'Supplier' && (i.partyId === supplier.id || i.partyName === supplier.name)
  );

  const supplierPayments = payments.filter(
    p => p.partyType === 'Supplier' && (p.partyId === supplier.id || p.partyName === supplier.name)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center font-bold text-sm shrink-0 border border-forest-500/20">
            <Truck className="w-5 h-5 text-forest-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">{supplier.name}</h2>
              <StatusBadge status={supplier.status} size="sm" />
            </div>
            <p className="text-xs text-slate-400 font-mono">Supplier Code: {supplier.supplierId}</p>
          </div>
        </div>
      }
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              onEdit(supplier);
            }}
            leftIcon={<Pencil className="w-4 h-4" />}
          >
            Edit Profile
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                setCurrentPage('general-ledger');
              }}
              leftIcon={<ExternalLink className="w-4 h-4" />}
            >
              Statement in GL
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* KPI Financial Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Invoiced (AP)</span>
            <span className="text-lg font-bold text-slate-100 mt-1 block">
              {formatCurrency(supplier.totalPurchases, currency)}
            </span>
            <span className="text-[10px] text-slate-500">{supplierInvoices.length} invoices on record</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Current Balance Due</span>
            <span className={`text-lg font-bold mt-1 block ${supplier.currentBalance > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {formatCurrency(supplier.currentBalance, currency)}
            </span>
            <span className="text-[10px] text-slate-500">Terms: {supplier.paymentTermsDays} Days Net</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Credit Limit</span>
            <span className="text-lg font-bold text-slate-200 mt-1 block">
              {supplier.creditLimit ? formatCurrency(supplier.creditLimit, currency) : 'No Limit'}
            </span>
            <span className="text-[10px] text-slate-500">Category: {supplier.supplierType}</span>
          </div>
        </div>

        {/* Profile & Contact Details */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Contact & Corporate Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Contact Person</span>
              <span className="font-semibold text-slate-200">{supplier.contactPerson || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Phone Number</span>
              <span className="font-semibold text-slate-200">{supplier.phone || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Email Address</span>
              <span className="font-semibold text-slate-200">{supplier.email || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">VAT / Tax Registration</span>
              <span className="font-mono text-slate-200">{supplier.vatNumber || supplier.taxNumber || 'Not recorded'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Location & City</span>
              <span className="text-slate-200">{[supplier.city, supplier.country].filter(Boolean).join(', ') || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Physical Address</span>
              <span className="text-slate-200 truncate">{supplier.address || '-'}</span>
            </div>
          </div>
        </div>

        {/* Office ownership & sharing */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Office</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Home office</span>
              <span className="font-semibold text-slate-200">{companies.find(o => o.id === supplier.officeId)?.name ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Visible to</span>
              <span className="text-slate-200">
                {supplier.sharing === 'selected'
                  ? supplier.sharedOfficeIds.map(id => companies.find(o => o.id === id)?.name ?? 'Other office').join(', ')
                  : SHARING_LABEL[supplier.sharing]}
              </span>
            </div>
          </div>
          <TransferHistory entity="supplier" recordId={supplier.id} />
        </div>

        {/* Transaction History Tabs: Invoices & Payments */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
            Recent Invoices & Bills ({supplierInvoices.length})
          </h3>
          {supplierInvoices.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center border border-slate-800/80 rounded-xl bg-slate-950/30">
              No invoices recorded for this supplier yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Due Date</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Balance Due</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {supplierInvoices.slice(0, 10).map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono font-bold text-slate-100">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-200">{formatCurrency(inv.grandTotal, currency)}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-400">{formatCurrency(inv.outstandingAmount, currency)}</td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={inv.paymentStatus} size="sm" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            onClose();
                            openInvoiceModal(inv.id);
                          }}
                          className="text-forest-400 hover:underline font-semibold cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payments History */}
        {supplierPayments.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
              Payments Disbursed ({supplierPayments.length})
            </h3>
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-3 py-2">Payment #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {supplierPayments.slice(0, 10).map(p => (
                    <tr key={p.id} className="hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono font-bold text-slate-100">{p.paymentNumber}</td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 text-slate-300">{p.paymentMethod}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{p.transactionReference || p.chequeNumber || '-'}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-400">{formatCurrency(p.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
