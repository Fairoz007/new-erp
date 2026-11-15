import React, { useState } from 'react';
import { Printer, Copy, FileText, Send, XCircle, Download } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { StatusBadge } from './StatusBadge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { useOptionalOrg } from '../../context/OrgContext';
import { formatCurrency } from '../../utils/financial';
import { createDebitNote } from '../../services/ledger';
import { useChildInvoices, useInvoiceById } from '../../services/queries-expenses';
import { invoicePrintData } from '../../lib/invoicePrint';
import { LetterheadDocument } from './LetterheadDocument';
import { RULES, atMost, fieldForDbMessage, focusFirstInvalid, hasErrors, positive, required, validate, type Errors } from '../../lib/validation';

type Busy = null | 'duplicate' | 'credit' | 'debit' | 'submit' | 'cancel' | 'pdf' | 'print';

export const PrintableInvoiceModal: React.FC = () => {
  const { companies, duplicateInvoice, createCreditNote, updateInvoice, submitInvoice, reload } = useFleet();
  const { viewingInvoiceId, closeInvoiceModal, addToast, openInvoiceModal, openVehicleDetail } = useUI();
  const { hasPermission, canApprove } = useAuth();
  const orgCtx = useOptionalOrg();
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
  const org = orgCtx?.organization ?? null;
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
  // what the printed page and the PDF show (office and organization read live from the contexts)
  const printData = invoicePrintData(invoice, company, org);

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

  // Download PDF: same layout as the print, vector text, saved as <number>.pdf
  const handleDownload = () => run('pdf', async () => {
    const pdf = await import('../../lib/letterheadPdf');
    const doc = pdf.buildInvoicePdf(printData, await pdf.loadLetterheadBytes());
    pdf.savePdf(doc, invoice.invoiceNumber);
  });
  // Print: the same PDF pages, printed from a hidden frame (downloaded when the browser cannot)
  const handlePrint = () => run('print', async () => {
    const pdf = await import('../../lib/letterheadPdf');
    const doc = pdf.buildInvoicePdf(printData, await pdf.loadLetterheadBytes());
    if (await pdf.printPdf(doc, invoice.invoiceNumber) === 'downloaded') {
      addToast({ type: 'info', title: 'PDF downloaded', message: 'This browser cannot print a PDF directly; open the downloaded file to print it.' });
    }
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
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!!busy} isLoading={busy === 'print'} leftIcon={<Printer className="w-4 h-4" />}>
              Print
            </Button>
            <Button variant="primary" size="sm" onClick={handleDownload} disabled={busy === 'pdf'} isLoading={busy === 'pdf'} leftIcon={<Download className="w-4 h-4" />}>
              Download PDF
            </Button>
          </div>
        </div>
      }
    >
      {/* Vehicle link and payment position: on screen only, the printed page has the plate */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
        {invoice.vehiclePlate && invoice.vehicleId && (
          <span>Vehicle:{' '}
            <button type="button" className="font-semibold text-brand-600 underline cursor-pointer"
              onClick={() => { closeInvoiceModal(); openVehicleDetail(invoice.vehicleId!, 'invoices'); }}>
              {invoice.vehiclePlate}
            </button>
          </span>
        )}
        {!invoice.isCreditNote && (
          <>
            <span>Paid: <strong className="text-slate-100">{formatCurrency(invoice.amountPaid, invoice.currency)}</strong></span>
            {creditedAmount > 0 && <span>Credited: <strong className="text-slate-100">{formatCurrency(creditedAmount, invoice.currency)}</strong></span>}
            <span>Balance due: <strong className="text-slate-100">{formatCurrency(invoice.outstandingAmount, invoice.currency)}</strong></span>
          </>
        )}
      </div>
      {/* A4 pages on the letterhead: the same layout is printed and saved as PDF */}
      <LetterheadDocument data={printData} />
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
