import React from 'react';
import { Users, Phone, Mail, MapPin, Building2, CreditCard, FileText, DollarSign, Calendar, ExternalLink, Pencil } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Customer } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { TransferHistory } from '../../components/common/TransferOfficeModal';
import { SHARING_LABEL } from '../../components/common/PartyOfficeFields';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

interface CustomerDetailModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customer,
  isOpen,
  onClose,
  onEdit,
}) => {
  const { invoices, payments, currency, companies } = useFleet();
  const { openInvoiceModal, setCurrentPage, openQuickModal } = useUI();

  if (!customer) return null;

  const customerInvoices = invoices.filter(
    i => i.partyType === 'Customer' && (i.partyId === customer.id || i.partyName === customer.name)
  );

  const customerPayments = payments.filter(
    p => p.partyType === 'Customer' && (p.partyId === customer.id || p.partyName === customer.name)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-500/20">
            <Users className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">{customer.name}</h2>
              <StatusBadge status={customer.status} size="sm" />
            </div>
            <p className="text-xs text-slate-400 font-mono">Customer Code: {customer.customerId}</p>
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
              onEdit(customer);
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
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Sales Invoiced (AR)</span>
            <span className="text-lg font-bold text-slate-100 mt-1 block">
              {formatCurrency(customer.totalSales, currency)}
            </span>
            <span className="text-[10px] text-slate-500">{customerInvoices.length} invoices on record</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Outstanding Receivables</span>
            <span className={`text-lg font-bold mt-1 block ${customer.currentBalance > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
              {formatCurrency(customer.currentBalance, currency)}
            </span>
            <span className="text-[10px] text-slate-500">Terms: {customer.paymentTermsDays} Days Net</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Approved Credit Limit</span>
            <span className="text-lg font-bold text-slate-200 mt-1 block">
              {customer.creditLimit ? formatCurrency(customer.creditLimit, currency) : 'No Limit'}
            </span>
            <span className="text-[10px] text-slate-500">Type: {customer.customerType}</span>
          </div>
        </div>

        {/* Profile & Contact Details */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Contact & Billing Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Primary Contact</span>
              <span className="font-semibold text-slate-200">{customer.contactPerson || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Direct Phone</span>
              <span className="font-semibold text-slate-200">{customer.phone || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Billing Email</span>
              <span className="font-semibold text-slate-200">{customer.email || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">VAT / Tax Registration</span>
              <span className="font-mono text-slate-200">{customer.vatNumber || customer.taxNumber || 'Not recorded'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">City & Region</span>
              <span className="text-slate-200">{[customer.city, customer.country].filter(Boolean).join(', ') || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Billing Address</span>
              <span className="text-slate-200 truncate">{customer.address || '-'}</span>
            </div>
          </div>
        </div>

        {/* Office ownership & sharing */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Office</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Home office</span>
              <span className="font-semibold text-slate-200">{companies.find(o => o.id === customer.officeId)?.name ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Visible to</span>
              <span className="text-slate-200">
                {customer.sharing === 'selected'
                  ? customer.sharedOfficeIds.map(id => companies.find(o => o.id === id)?.name ?? 'Other office').join(', ')
                  : SHARING_LABEL[customer.sharing]}
              </span>
            </div>
          </div>
          <TransferHistory entity="client" recordId={customer.id} />
        </div>

        {/* Transaction History: Invoices */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
            Sales Invoices ({customerInvoices.length})
          </h3>
          {customerInvoices.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center border border-slate-800/80 rounded-xl bg-slate-950/30">
              No sales invoices generated for this client yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Due Date</th>
                    <th className="px-3 py-2 text-right">Grand Total</th>
                    <th className="px-3 py-2 text-right">Receivable</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {customerInvoices.slice(0, 10).map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono font-bold text-slate-100">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-200">{formatCurrency(inv.grandTotal, currency)}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-400">{formatCurrency(inv.outstandingAmount, currency)}</td>
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

        {/* Payments Received History */}
        {customerPayments.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
              Payments Received ({customerPayments.length})
            </h3>
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-3 py-2">Receipt #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {customerPayments.slice(0, 10).map(p => (
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
