import React, { useRef, useState } from 'react';
import { Printer, Copy, FileText, Send, XCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { StatusBadge } from './StatusBadge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { createDebitNote } from '../../services/ledger';
import { useChildInvoices, useInvoiceById } from '../../services/queries-expenses';
import { RULES, atMost, fieldForDbMessage, focusFirstInvalid, hasErrors, positive, required, validate, type Errors } from '../../lib/validation';

type Busy = null | 'duplicate' | 'credit' | 'debit' | 'submit' | 'cancel';

export const PrintableInvoiceModal: React.FC = () => {
  const { companies, duplicateInvoice, createCreditNote, updateInvoice, submitInvoice, reload } = useFleet();
  const { viewingInvoiceId, closeInvoiceModal, addToast, openInvoiceModal, openVehicleDetail } = useUI();
  const { hasPermission, canApprove } = useAuth();
  const printableRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [cnOpen, setCnOpen] = useState(false);
  const [cnReason, setCnReason] = useState('');
  const [cnAmount, setCnAmount] = useState('');
  const [dnOpen, setDnOpen] = useState(false);
  const [dn, setDn] = useState({ reason: '', description: '', amount: '', taxRate: '5' });
  // inline errors of the credit / debit note forms (only one is open at a time)
  const [noteErrors, setNoteErrors] = useState<Errors>({});
  const clearNoteError = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (name && noteErrors[name]) setNoteErrors(({ [name]: _, ...rest }) => rest);
  };

  // The invoice with its lines, and the notes raised against it, read by id
  const invoiceQ = useInvoiceById(viewingInvoiceId);
  const childrenQ = useChildInvoices(viewingInvoiceId);

  if (!viewingInvoiceId) return null;

  // useQuery keeps the previous invoice while the next one loads: only show the one asked for
  const invoice = invoiceQ.data && invoiceQ.data.id === viewingInvoiceId ? invoiceQ.data : undefined;
  if (!invoice && (invoiceQ.loading || invoiceQ.fetching) && !invoiceQ.error) {
    return (
      <Modal isOpen={true} onClose={closeInvoiceModal} title="Loading invoice…" size="sm">
        <p className="p-4 text-center text-xs text-slate-400" role="status">Loading invoice…</p>
      </Modal>
    );
  }
  if (!invoice) {
    return (
      <Modal isOpen={true} onClose={closeInvoiceModal} title="Invoice Not Found" size="sm">
        <div className="p-4 text-center space-y-4">
          <p className="text-xs text-slate-300">The requested invoice could not be found or you do not have access to it.</p>
          {invoiceQ.error && !/not found/i.test(invoiceQ.error.message) && (
            <p role="alert" className="text-xs text-rose-500">{invoiceQ.error.message}</p>
          )}
          <div className="flex justify-center gap-2">
            {invoiceQ.error && !/not found/i.test(invoiceQ.error.message) && (
              <Button variant="outline" size="sm" onClick={() => void invoiceQ.refetch()}>Retry</Button>
            )}
            <Button variant="secondary" size="sm" onClick={closeInvoiceModal}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const company = companies.find(c => c.id === invoice.companyId);
  const canCreate = hasPermission('create', 'invoices');
  const canEdit = hasPermission('edit', 'invoices');
  const isPosted = invoice.approvalStatus === 'Approved';
  const isOpenDraft = invoice.approvalStatus === 'Draft' || invoice.approvalStatus === 'Rejected';
  // Credited amount is derived from this invoice's credit notes (the DB keeps the authoritative figure)
  const creditedAmount = (childrenQ.data ?? [])
    .filter(i => i.isCreditNote && i.parentInvoiceId === invoice.id && i.approvalStatus !== 'Cancelled')
    .reduce((s, i) => s + Math.abs(i.grandTotal), 0);
  const canCredit = canCreate && isPosted && !invoice.isCreditNote && invoice.outstandingAmount > 0;
  // A debit note is an extra charge on a posted invoice or bill (same party, office and currency).
  const canDebit = canCreate && isPosted && !invoice.isCreditNote && !invoice.isDebitNote;
  const noteLabel = invoice.isCreditNote ? 'Credit Note' : invoice.isDebitNote ? 'Debit Note' : `${invoice.invoiceType} Invoice`;
  const vatRates = Array.from(new Set(invoice.items.map(i => i.taxRatePercentage)));
  const vatLabel = vatRates.length === 1 ? `VAT (${vatRates[0]}%)` : 'VAT';

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>, dbFields?: Parameters<typeof fieldForDbMessage>[1]) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      const message = (e as Error).message;
      // a rule the database checks (RULES): show it on its field as well
      const field = dbFields ? fieldForDbMessage(message, dbFields) : null;
      if (field) { setNoteErrors({ [field]: message }); focusFirstInvalid(); }
      addToast({ type: 'error', title: 'Action failed', message });
    } finally {
      setBusy(null);
    }
  };

  const handleDuplicate = () => run('duplicate', async () => {
    const cloned = await duplicateInvoice(invoice.id);
    addToast({ type: 'success', title: 'Invoice Duplicated', message: `Created draft ${cloned.invoiceNumber}. Submit it for approval when ready.` });
    openInvoiceModal(cloned.id);
  });

  const handleSubmit = () => run('submit', async () => {
    const status = await submitInvoice(invoice.id);
    addToast({
      type: 'success',
      title: status === 'Approved' ? 'Invoice Approved & Posted' : 'Sent for Approval',
      message: status === 'Approved'
        ? `${invoice.invoiceNumber} was posted to the general ledger.`
        : `${invoice.invoiceNumber} is waiting for an approver (Approvals page).`,
    });
  });

  const handleCancel = () => run('cancel', async () => {
    if (!window.confirm(`Cancel ${invoice.invoiceNumber}? Cancelled invoices cannot be submitted or paid.`)) return;
    await updateInvoice(invoice.id, { approvalStatus: 'Cancelled' });
    addToast({ type: 'success', title: 'Invoice Cancelled', message: invoice.invoiceNumber });
  });

  const openCreditNote = () => {
    setCnReason('');
    setCnAmount(invoice.outstandingAmount.toFixed(3));
    setNoteErrors({});
    setCnOpen(true);
  };

  const handleCreateCreditNote = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(cnAmount);
    const found = validate({ amount: cnAmount, reason: cnReason }, {
      amount: [positive('Credit amount', RULES.creditAmountPositive),
        atMost('Credit amount', invoice.outstandingAmount + 0.0005, `Credit amount cannot be more than the outstanding ${invoice.outstandingAmount.toFixed(3)}`)],
      reason: [required('Reason', RULES.creditReasonRequired)],
    });
    setNoteErrors(found);
    if (hasErrors(found)) return;
    run('credit', async () => {
      const cn = await createCreditNote(invoice.id, cnReason.trim(), amount);
      addToast({ type: 'success', title: 'Credit Note Created', message: `${cn.invoiceNumber} posted against ${invoice.invoiceNumber}.` });
      setCnOpen(false);
    }, { amount: [RULES.creditAmountPositive, 'Credit amount'], reason: [RULES.creditReasonRequired] });
  };

  const handleCreateDebitNote = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(dn.amount);
    const taxRate = Number(dn.taxRate);
    const found = validate(dn, {
      description: [required('Line description')],
      amount: [positive('Amount')],
      taxRate: [v => (!(Number(v) >= 0 && Number(v) <= 100) || String(v).trim() === '' ? 'VAT % must be between 0 and 100' : null)],
      reason: [required('Reason', 'A reason is required for a debit note')],
    });
    setNoteErrors(found);
    if (hasErrors(found)) return;
    run('debit', async () => {
      await createDebitNote(invoice.id, dn.reason, [{ description: dn.description, quantity: 1, unitPrice: amount, taxRate }]);
      await reload(['invoices', 'journalEntries', 'chartOfAccounts', 'notifications']);
      addToast({ type: 'success', title: 'Debit Note Created', message: `Raised against ${invoice.invoiceNumber}. It is posted once approved.` });
      setDnOpen(false);
    });
  };

  return (
    <>
    <Modal
      isOpen={!!viewingInvoiceId}
      onClose={() => { if (!busy) closeInvoiceModal(); }}
      title={
        <div className="flex items-center gap-2">
          <span>{noteLabel}: {invoice.invoiceNumber}</span>
          <StatusBadge status={invoice.paymentStatus} size="sm" />
          <StatusBadge status={invoice.approvalStatus} size="sm" />
        </div>
      }
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && !invoice.isCreditNote && (
              <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={!!busy} isLoading={busy === 'duplicate'} leftIcon={<Copy className="w-4 h-4" />}>
                Duplicate
              </Button>
            )}
            {canCredit && canApprove('invoice', 0.001) && (
              <Button variant="outline" size="sm" onClick={openCreditNote} disabled={!!busy}
                leftIcon={<FileText className="w-4 h-4" />}>
                Create Credit Note
              </Button>
            )}
            {canDebit && (
              <Button variant="outline" size="sm" onClick={() => { setDn({ reason: '', description: '', amount: '', taxRate: String(invoice.items[0]?.taxRatePercentage ?? 5) }); setNoteErrors({}); setDnOpen(true); }} disabled={!!busy}
                leftIcon={<FileText className="w-4 h-4" />}>
                Create Debit Note
              </Button>
            )}
            {(canCreate || canEdit) && !invoice.isCreditNote && (isOpenDraft || (invoice.approvalStatus === 'Pending Approval' && !invoice.approvedBy)) && invoice.paymentStatus !== 'Cancelled' && (
              <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!!busy} isLoading={busy === 'submit'} leftIcon={<Send className="w-4 h-4" />}>
                {canApprove('invoice', invoice.grandTotal) ? 'Approve & Post' : 'Submit for Approval'}
              </Button>
            )}
            {canEdit && isOpenDraft && (
              <Button variant="danger" size="sm" onClick={handleCancel} disabled={!!busy} isLoading={busy === 'cancel'} leftIcon={<XCircle className="w-4 h-4" />}>
                Cancel Invoice
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={closeInvoiceModal} disabled={!!busy}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
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
        {!isPosted && (
          <div className="mb-4 p-2 rounded border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-bold uppercase tracking-wide text-center">
            {invoice.approvalStatus} - not posted to the ledger
          </div>
        )}

        {/* Header Letterhead */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-slate-900">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xl tracking-tighter shrink-0">
              {(company?.code || invoice.companyName || '?').slice(0, 3)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{company?.name || invoice.companyName}</h2>
              {company && (
                <>
                  <p className="text-slate-600 mt-0.5">{[company.address, company.city, company.country].filter(Boolean).join(', ')}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-500">
                    {company.registrationNumber && <span><strong>CR:</strong> {company.registrationNumber}</span>}
                    {company.vatNumber && <span><strong>VAT No:</strong> {company.vatNumber}</span>}
                    {company.phone && <span><strong>Phone:</strong> {company.phone}</span>}
                    {company.email && <span><strong>Email:</strong> {company.email}</span>}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <h2 className="text-2xl font-black text-indigo-900 uppercase tracking-wide">
              {invoice.isCreditNote ? 'CREDIT NOTE' : invoice.isDebitNote ? 'DEBIT NOTE' : `${invoice.invoiceType.toUpperCase()} INVOICE`}
            </h2>
            <p className="text-sm font-bold text-slate-800 mt-1">{invoice.invoiceNumber}</p>
            <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
              <p><strong>{invoice.isCreditNote ? 'Date' : 'Invoice Date'}:</strong> {formatDate(invoice.invoiceDate)}</p>
              {!invoice.isCreditNote && <p><strong>Due Date:</strong> {formatDate(invoice.dueDate)}</p>}
              {invoice.isCreditNote && invoice.referenceNumber && <p><strong>Against Invoice:</strong> {invoice.referenceNumber}</p>}
              {!invoice.isCreditNote && invoice.referenceNumber && <p><strong>Reference:</strong> {invoice.referenceNumber}</p>}
              {invoice.purchaseOrderNumber && <p><strong>PO Number:</strong> {invoice.purchaseOrderNumber}</p>}
              {invoice.workOrderNumber && <p><strong>Work Order:</strong> {invoice.workOrderNumber}</p>}
              {invoice.vehiclePlate && (
                <p>
                  <strong>Vehicle:</strong>{' '}
                  {invoice.vehicleId ? (
                    <button
                      type="button"
                      onClick={() => {
                        closeInvoiceModal();
                        openVehicleDetail(invoice.vehicleId!, 'invoices');
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      {invoice.vehiclePlate}
                    </button>
                  ) : (
                    invoice.vehiclePlate
                  )}
                </p>
              )}
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
            {!invoice.isCreditNote && <p className="text-slate-700 mt-1"><strong>Terms:</strong> {invoice.paymentTermsDays} Days Net</p>}
            <p className="text-slate-700 mt-0.5"><strong>Currency:</strong> {invoice.currency}</p>
            <p className="text-slate-700 mt-0.5"><strong>Status:</strong> {invoice.paymentStatus.toUpperCase()}</p>
            {invoice.invoiceType === 'Sales' && company?.bankDetails?.iban && (
              <p className="text-slate-600 text-[11px] mt-1">
                <strong>Bank:</strong> {company.bankDetails.bankName} | <strong>IBAN:</strong> {company.bankDetails.iban}
              </p>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-6 overflow-x-auto print:overflow-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-[11px] text-slate-800 font-bold uppercase tracking-wider">
                <th scope="col" className="py-2.5 px-2">#</th>
                <th scope="col" className="py-2.5 px-2">Item & Description</th>
                <th scope="col" className="py-2.5 px-2 text-center">Qty</th>
                <th scope="col" className="py-2.5 px-2 text-right">Unit Price</th>
                <th scope="col" className="py-2.5 px-2 text-right">Discount</th>
                <th scope="col" className="py-2.5 px-2 text-right">VAT</th>
                <th scope="col" className="py-2.5 px-2 text-right">Total ({invoice.currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.items.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-slate-400">No lines</td></tr>
              )}
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
                  <td className="py-3 px-2 text-right">{item.taxAmount.toFixed(3)} <span className="text-[10px] text-slate-400">({item.taxRatePercentage}%)</span></td>
                  <td className="py-3 px-2 text-right font-bold text-slate-900">{item.lineTotal.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Summary */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mt-8 pt-6 border-t-2 border-slate-200">
          <div className="w-full sm:w-1/2 text-slate-600 text-[11px] space-y-1">
            {invoice.termsAndConditions && (
              <>
                <p className="font-bold text-slate-800 uppercase text-xs">Terms</p>
                <p>{invoice.termsAndConditions}</p>
              </>
            )}
            {invoice.notes && <p className="italic text-slate-500 mt-2"><strong>Notes:</strong> {invoice.notes}</p>}
          </div>

          <div className="w-full sm:w-5/12 bg-slate-50 p-4 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-medium text-slate-900">{formatCurrency(Math.abs(invoice.subtotal), invoice.currency)}</span>
            </div>
            {Math.abs(invoice.discountTotal) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount:</span>
                <span>-{formatCurrency(Math.abs(invoice.discountTotal), invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>{vatLabel}:</span>
              <span className="font-medium text-slate-900">{formatCurrency(Math.abs(invoice.taxTotal), invoice.currency)}</span>
            </div>
            {invoice.otherCharges > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Other Charges:</span>
                <span>{formatCurrency(invoice.otherCharges, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t-2 border-slate-300">
              <span>{invoice.isCreditNote ? 'Credit Total:' : 'Grand Total:'}</span>
              <span className="text-indigo-900">{formatCurrency(Math.abs(invoice.grandTotal), invoice.currency)}</span>
            </div>

            {!invoice.isCreditNote && (
              <>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>Amount Paid:</span>
                  <span className="text-emerald-700 font-semibold">{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
                </div>
                {creditedAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Credited:</span>
                    <span className="text-emerald-700 font-semibold">{formatCurrency(creditedAmount, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-bold bg-amber-50 p-2 rounded border border-amber-200">
                  <span>Balance Due:</span>
                  <span className="text-amber-900">{formatCurrency(invoice.outstandingAmount, invoice.currency)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Signatures: blank lines to sign; no pre-printed authorisation */}
        <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-slate-300 text-center">
          <div>
            <div className="h-16" />
            <div className="w-48 mx-auto border-t border-slate-800 pt-1">
              <p className="font-bold text-slate-800">Prepared By</p>
            </div>
          </div>
          <div>
            <div className="h-16 flex items-end justify-center">
              {isPosted && invoice.approvalDate && (
                <span className="text-[10px] text-slate-500">Approved in system on {formatDate(invoice.approvalDate)}</span>
              )}
            </div>
            <div className="w-48 mx-auto border-t border-slate-800 pt-1">
              <p className="font-bold text-slate-800">Authorized Signature & Stamp</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>

    <Modal
      isOpen={cnOpen}
      onClose={() => { if (busy !== 'credit') setCnOpen(false); }}
      title={`Credit Note against ${invoice.invoiceNumber}`}
      description={`Outstanding: ${formatCurrency(invoice.outstandingAmount, invoice.currency)}. The credit note is posted to the ledger immediately and reduces the outstanding amount.`}
      size="md"
    >
      <form onSubmit={handleCreateCreditNote} onChange={clearNoteError} className="space-y-4" noValidate>
        <Input
          label={`Credit Amount (${invoice.currency}, incl. VAT)`}
          type="number"
          step="0.001"
          min="0.001"
          max={invoice.outstandingAmount}
          value={cnAmount}
          onChange={e => setCnAmount(e.target.value)}
          required
          name="amount"
          error={noteErrors.amount}
        />
        <Textarea label="Reason" rows={3} value={cnReason} onChange={e => setCnReason(e.target.value)} required name="reason" error={noteErrors.reason} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => setCnOpen(false)} disabled={busy === 'credit'}>Cancel</Button>
          <Button variant="primary" type="submit" isLoading={busy === 'credit'} disabled={!!busy}>Issue Credit Note</Button>
        </div>
      </form>
    </Modal>

    <Modal
      isOpen={dnOpen}
      onClose={() => { if (busy !== 'debit') setDnOpen(false); }}
      title={`Debit Note against ${invoice.invoiceNumber}`}
      description="An extra charge to the same party. It goes through the normal invoice approval and is posted to the ledger once approved."
      size="md"
    >
      <form onSubmit={handleCreateDebitNote} onChange={clearNoteError} className="space-y-4" noValidate>
        <Input label="Line description" value={dn.description} onChange={e => setDn({ ...dn, description: e.target.value })} required name="description" error={noteErrors.description} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={`Amount (${invoice.currency}, excl. VAT)`} type="number" step="0.001" min="0.001" value={dn.amount} onChange={e => setDn({ ...dn, amount: e.target.value })} required name="amount" error={noteErrors.amount} />
          <Input label="VAT %" type="number" step="0.01" min="0" max="100" value={dn.taxRate} onChange={e => setDn({ ...dn, taxRate: e.target.value })} required name="taxRate" error={noteErrors.taxRate} />
        </div>
        <Textarea label="Reason" rows={3} value={dn.reason} onChange={e => setDn({ ...dn, reason: e.target.value })} required name="reason" error={noteErrors.reason} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => setDnOpen(false)} disabled={busy === 'debit'}>Cancel</Button>
          <Button variant="primary" type="submit" isLoading={busy === 'debit'} disabled={!!busy}>Issue Debit Note</Button>
        </div>
      </form>
    </Modal>
    </>
  );
};
