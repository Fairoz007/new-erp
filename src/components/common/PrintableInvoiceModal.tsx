import React, { useRef } from 'react';
import { Printer, Copy, FileText, Download, X, CheckCircle, ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { StatusBadge } from './StatusBadge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const PrintableInvoiceModal: React.FC = () => {
  const { invoices, companies, duplicateInvoice, createCreditNote } = useFleet();
  const { viewingInvoiceId, closeInvoiceModal, addToast } = useUI();
  const printableRef = useRef<HTMLDivElement>(null);

  const invoice = invoices.find(inv => inv.id === viewingInvoiceId);
  if (!invoice) return null;

  const company = companies.find(c => c.id === invoice.companyId) || companies[0];

  const handlePrint = () => {
    window.print();
  };

  const handleDuplicate = () => {
    try {
      const cloned = duplicateInvoice(invoice.id);
      addToast({
        type: 'success',
        title: 'Invoice Duplicated',
        message: `Created clone as ${cloned.invoiceNumber}`,
      });
      closeInvoiceModal();
    } catch {
      addToast({ type: 'error', title: 'Failed to duplicate invoice' });
    }
  };

  const handleCreateCreditNote = () => {
    try {
      const cn = createCreditNote(invoice.id, 'Customer cancellation / Adjustment');
      addToast({
        type: 'success',
        title: 'Credit Note Created',
        message: `Created credit note ${cn.invoiceNumber}`,
      });
      closeInvoiceModal();
    } catch {
      addToast({ type: 'error', title: 'Failed to create credit note' });
    }
  };

  return (
    <Modal
      isOpen={!!viewingInvoiceId}
      onClose={closeInvoiceModal}
      title={
        <div className="flex items-center gap-2">
          <span>{invoice.invoiceType} Invoice Preview: {invoice.invoiceNumber}</span>
          <StatusBadge status={invoice.paymentStatus} size="sm" />
        </div>
      }
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDuplicate} leftIcon={<Copy className="w-4 h-4" />}>
              Duplicate Invoice
            </Button>
            {!invoice.isCreditNote && (
              <Button variant="outline" size="sm" onClick={handleCreateCreditNote} leftIcon={<FileText className="w-4 h-4" />}>
                Create Credit Note
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={closeInvoiceModal}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={handlePrint} leftIcon={<Printer className="w-4 h-4" />}>
              Print / Save PDF
            </Button>
          </div>
        </div>
      }
    >
      {/* Printable Area - Rendered cleanly for screen & print */}
      <div
        ref={printableRef}
        id="printable-invoice"
        className="bg-white text-slate-900 p-8 sm:p-10 rounded-xl shadow-md font-sans text-xs print:p-0 print:shadow-none print:bg-white print:text-black"
      >
        {/* Header Letterhead */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-slate-900">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xl tracking-tighter shrink-0">
              {company.code.slice(0, 3)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{company.name}</h1>
              <p className="text-slate-600 mt-0.5">{company.address}, {company.city}, {company.country}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-500">
                <span><strong>CR:</strong> {company.registrationNumber}</span>
                <span><strong>VAT No:</strong> {company.vatNumber}</span>
                <span><strong>Phone:</strong> {company.phone}</span>
                <span><strong>Email:</strong> {company.email}</span>
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <h2 className="text-2xl font-black text-indigo-900 uppercase tracking-wide">
              {invoice.isCreditNote ? 'CREDIT NOTE' : `${invoice.invoiceType.toUpperCase()} INVOICE`}
            </h2>
            <p className="text-sm font-bold text-slate-800 mt-1">{invoice.invoiceNumber}</p>
            <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
              <p><strong>Invoice Date:</strong> {formatDate(invoice.invoiceDate)}</p>
              <p><strong>Due Date:</strong> {formatDate(invoice.dueDate)}</p>
              {invoice.purchaseOrderNumber && <p><strong>PO Number:</strong> {invoice.purchaseOrderNumber}</p>}
              {invoice.workOrderNumber && <p><strong>Work Order:</strong> {invoice.workOrderNumber}</p>}
              {invoice.vehiclePlate && <p><strong>Vehicle:</strong> {invoice.vehiclePlate}</p>}
            </div>
          </div>
        </div>

        {/* Billed To / From */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {invoice.invoiceType === 'Sales' ? 'BILLED TO (CUSTOMER)' : 'ISSUED BY (SUPPLIER)'}
            </p>
            <h3 className="text-sm font-bold text-slate-900 mt-1">{invoice.partyName}</h3>
            {invoice.partyAddress && <p className="text-slate-600 mt-0.5">{invoice.partyAddress}</p>}
            {invoice.partyVatNumber && <p className="text-slate-600 mt-0.5"><strong>VAT No:</strong> {invoice.partyVatNumber}</p>}
            {invoice.partyPhone && <p className="text-slate-600 mt-0.5"><strong>Phone:</strong> {invoice.partyPhone}</p>}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PAYMENT TERMS & INSTRUCTIONS</p>
            <p className="text-slate-700 mt-1"><strong>Terms:</strong> {invoice.paymentTermsDays} Days Net</p>
            <p className="text-slate-700 mt-0.5"><strong>Currency:</strong> {invoice.currency} (Omani Rial)</p>
            <p className="text-slate-700 mt-0.5"><strong>Status:</strong> {invoice.paymentStatus.toUpperCase()}</p>
            {company.bankDetails && (
              <p className="text-slate-600 text-[11px] mt-1">
                <strong>Bank:</strong> {company.bankDetails.bankName} | <strong>IBAN:</strong> {company.bankDetails.iban}
              </p>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-[11px] text-slate-800 font-bold uppercase tracking-wider">
                <th className="py-2.5 px-2">#</th>
                <th className="py-2.5 px-2">Item & Description</th>
                <th className="py-2.5 px-2 text-center">Qty</th>
                <th className="py-2.5 px-2 text-right">Unit Price</th>
                <th className="py-2.5 px-2 text-right">Discount</th>
                <th className="py-2.5 px-2 text-right">VAT (5%)</th>
                <th className="py-2.5 px-2 text-right">Total ({invoice.currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.items.map((item, idx) => (
                <tr key={item.id || idx} className="text-slate-800 text-xs">
                  <td className="py-3 px-2 font-medium text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-2">
                    <p className="font-semibold text-slate-900">{item.description}</p>
                    {item.itemCode && <p className="text-[10px] text-slate-500 font-mono">Code: {item.itemCode}</p>}
                    {item.vehiclePlate && <p className="text-[10px] text-indigo-700">Vehicle: {item.vehiclePlate}</p>}
                  </td>
                  <td className="py-3 px-2 text-center">{item.quantity} {item.unit}</td>
                  <td className="py-3 px-2 text-right">{item.unitPrice.toFixed(3)}</td>
                  <td className="py-3 px-2 text-right">{item.discountAmount > 0 ? `-${item.discountAmount.toFixed(3)}` : '-'}</td>
                  <td className="py-3 px-2 text-right">{item.taxAmount.toFixed(3)}</td>
                  <td className="py-3 px-2 text-right font-bold text-slate-900">{item.lineTotal.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Summary */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mt-8 pt-6 border-t-2 border-slate-200">
          <div className="w-full sm:w-1/2 text-slate-600 text-[11px] space-y-1">
            <p className="font-bold text-slate-800 uppercase text-xs">Terms & Notes</p>
            <p>{invoice.termsAndConditions || 'Payment is due as per agreed credit contract terms. Cheques to be made payable to the company name.'}</p>
            {invoice.notes && <p className="italic text-slate-500 mt-2"><strong>Notes:</strong> {invoice.notes}</p>}
          </div>

          <div className="w-full sm:w-5/12 bg-slate-50 p-4 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-medium text-slate-900">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount:</span>
                <span>-{formatCurrency(invoice.discountTotal, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>VAT / Tax (5%):</span>
              <span className="font-medium text-slate-900">{formatCurrency(invoice.taxTotal, invoice.currency)}</span>
            </div>
            {invoice.otherCharges > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Other Charges:</span>
                <span>{formatCurrency(invoice.otherCharges, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t-2 border-slate-300">
              <span>Grand Total:</span>
              <span className="text-indigo-900">{formatCurrency(invoice.grandTotal, invoice.currency)}</span>
            </div>

            <div className="flex justify-between text-slate-600 pt-1">
              <span>Amount Paid:</span>
              <span className="text-emerald-700 font-semibold">{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold bg-amber-50 p-2 rounded border border-amber-200">
              <span>Balance Due:</span>
              <span className="text-amber-900">{formatCurrency(invoice.outstandingAmount, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Authorized Signatures & Seal */}
        <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-slate-300 text-center">
          <div>
            <div className="h-16 flex items-end justify-center">
              <span className="font-serif italic text-slate-400">Electronic Verification</span>
            </div>
            <div className="w-48 mx-auto border-t border-slate-800 pt-1">
              <p className="font-bold text-slate-800">Prepared By</p>
              <p className="text-[10px] text-slate-500">Finance & Fleet Operations</p>
            </div>
          </div>

          <div>
            <div className="h-16 flex items-end justify-center">
              <div className="border border-indigo-900/40 text-indigo-900 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                ✓ Authorized Signatory
              </div>
            </div>
            <div className="w-48 mx-auto border-t border-slate-800 pt-1">
              <p className="font-bold text-slate-800">Authorized Signature & Stamp</p>
              <p className="text-[10px] text-slate-500">Executive Management</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
