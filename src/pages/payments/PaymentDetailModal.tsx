import React from 'react';
import { CreditCard, Calendar, Building2, FileText, Paperclip, Printer, ExternalLink, ArrowRight, ShieldCheck } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Payment } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { useInvoiceById } from '../../services/queries-expenses';

interface PaymentDetailModalProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  payment,
  isOpen,
  onClose,
}) => {
  const { bankAccounts, currency } = useFleet();
  const { openInvoiceModal, openBillModal } = useUI();
  // the linked invoice, read by id (its balance and status as of now)
  const invoiceQ = useInvoiceById(isOpen ? payment?.invoiceId : null);

  if (!payment) return null;

  const linkedInvoice = invoiceQ.data && invoiceQ.data.id === payment.invoiceId ? invoiceQ.data : undefined;
  const bank = bankAccounts.find(b => b.id === payment.bankAccountId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-500/20">
            <CreditCard className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Payment Voucher: {payment.paymentNumber}
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Recorded on {formatDate(payment.paymentDate)} • {payment.partyType} {payment.partyType === 'Supplier' ? 'Disbursal' : 'Collection'}
            </p>
          </div>
        </div>
      }
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {linkedInvoice && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  openInvoiceModal(linkedInvoice.id);
                }}
                leftIcon={<FileText className="w-4 h-4" />}
              >
                View Linked Invoice
              </Button>
            )}
            {payment.attachmentUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  openBillModal(payment.attachmentUrl!, payment.attachmentName || payment.paymentNumber);
                }}
                leftIcon={<Paperclip className="w-4 h-4" />}
              >
                View Receipt Document
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
              Print Voucher
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* Big Amount Card */}
        <div className="p-5 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-800/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              {payment.partyType === 'Supplier' ? 'Amount Disbursed' : 'Amount Received'}
            </span>
            <span className="text-3xl font-black text-slate-100 mt-1 block tracking-tight">
              {formatCurrency(payment.amount, payment.currency || currency)}
            </span>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Balanced and posted to General Ledger
            </p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Payment Method</span>
            <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 font-bold text-xs inline-block mt-1 border border-slate-700">
              {payment.paymentMethod}
            </span>
          </div>
        </div>

        {/* Payment & Counterparty Details */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Transaction Specifications</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Beneficiary / Customer</span>
              <span className="font-bold text-slate-100 text-sm">{payment.partyName}</span>
              <span className="text-[10px] text-slate-500 block">({payment.partyType})</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Bank / Funding Account</span>
              <span className="font-semibold text-slate-200">{payment.bankAccountName || bank?.bankName || 'General Account'}</span>
              {bank?.accountNumber && <span className="text-[10px] font-mono text-slate-400 block">Acc: {bank.accountNumber}</span>}
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Payment Execution Date</span>
              <span className="font-semibold text-slate-200">{formatDate(payment.paymentDate)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Transaction Reference</span>
              <span className="font-mono text-slate-200">{payment.transactionReference || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Cheque Number</span>
              <span className="font-mono text-slate-200">{payment.chequeNumber || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Linked Invoice</span>
              <span className="font-mono font-bold text-forest-400">{payment.invoiceNumber}</span>
            </div>
          </div>
        </div>

        {/* Linked Invoice Summary */}
        {linkedInvoice && (
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Linked Invoice Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Invoice Total</span>
                <span className="font-bold text-slate-200">{formatCurrency(linkedInvoice.grandTotal, linkedInvoice.currency)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Total Paid to Date</span>
                <span className="font-bold text-emerald-400">{formatCurrency(linkedInvoice.amountPaid, linkedInvoice.currency)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Remaining Balance</span>
                <span className="font-bold text-amber-400">{formatCurrency(linkedInvoice.outstandingAmount, linkedInvoice.currency)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Invoice Payment Status</span>
                <span className="font-bold text-slate-200">{linkedInvoice.paymentStatus}</span>
              </div>
            </div>
          </div>
        )}

        {/* Notes & Remittance Advice */}
        {payment.notes && (
          <div className="p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Notes & Remittance Details</span>
            <p className="text-xs text-slate-300 mt-1 italic">{payment.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
