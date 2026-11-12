// Client / supplier detail page (#customer-detail?id=… / #supplier-detail?id=…): profile, office and
// sharing, registration review, custom fields, invoices, payments, contracts and history.
import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, FileSignature, Pencil, Receipt, Share2, Wallet, XCircle, History } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, formatDateTime } from '../../utils/date';
import { reviewParty } from '../../services/finance';
import { postOpeningPartyBalance } from '../../services/org';
import { PartyEditModal } from '../suppliers/PartyEditModal';
import { PartySharingModal } from '../../components/common/PartySharingModal';
import { SHARING_LABEL } from '../../components/common/PartyOfficeFields';
import { TransferHistory, TransferOfficeModal } from '../../components/common/TransferOfficeModal';
import { useCustomFields } from '../../hooks/useCustomFields';
import { formatCustomValue, openFileValue } from '../../components/common/CustomFieldsForm';
import { ContractsPanel } from './ContractsPanel';
import type { Customer, Supplier } from '../../types/operations';

type Kind = 'customer' | 'supplier';
type Tab = 'overview' | 'invoices' | 'payments' | 'contracts' | 'history';

const REG_VARIANT = { Pending: 'amber', Approved: 'emerald', Rejected: 'rose' } as const;

export const PartyDetailPage: React.FC<{ kind: Kind }> = ({ kind }) => {
  const fleet = useFleet();
  const { companies, invoices, payments, currency, auditLogs, updateCustomer, updateSupplier, reload } = fleet;
  const { selectedPartyId, setCurrentPage, openInvoiceModal, addToast } = useUI();
  const { hasPermission, currentUser, isSuperAdmin, users } = useAuth();
  const module = kind === 'customer' ? 'customers' : 'suppliers';
  const partyType = kind === 'customer' ? 'Customer' : 'Supplier';
  const party: Customer | Supplier | undefined = kind === 'customer'
    ? fleet.customers.find(c => c.id === selectedPartyId)
    : fleet.suppliers.find(s => s.id === selectedPartyId);
  const cf = useCustomFields(kind === 'customer' ? 'client' : 'supplier');
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [review, setReview] = useState<'Approved' | 'Rejected' | null>(null);
  const [opening, setOpening] = useState(false);

  const partyInvoices = useMemo(() => (party ? invoices.filter(i => i.partyType === partyType && i.partyId === party.id) : []), [invoices, party, partyType]);
  const partyPayments = useMemo(() => (party ? payments.filter(p => p.partyType === partyType && p.partyId === party.id) : []), [payments, party, partyType]);
  const history = useMemo(() => (party ? auditLogs.filter(l => l.entityId === party.id) : []), [auditLogs, party]);

  if (!party) {
    return (
      <div className="p-8 text-center text-slate-400 space-y-3">
        <p>This {kind === 'customer' ? 'client' : 'supplier'} was not found or is not visible to you.</p>
        <Button variant="secondary" size="sm" onClick={() => setCurrentPage(module)}>Back to the list</Button>
      </div>
    );
  }

  const code = kind === 'customer' ? (party as Customer).customerId : (party as Supplier).supplierId;
  const typeLabel = kind === 'customer' ? (party as Customer).customerType : (party as Supplier).supplierType;
  const office = companies.find(c => c.id === party.officeId);
  const canEdit = hasPermission('edit', module, party.officeId);
  const canApprove = hasPermission('approve', module, party.officeId);
  const ownSubmission = party.registration.submittedBy === currentUser?.id && !isSuperAdmin;
  const canTransfer = canEdit && companies.some(c => c.id !== party.officeId && hasPermission('create', module, c.id));
  const canPostOpening = hasPermission('create', 'invoices', party.officeId) && hasPermission('create', 'accounting', party.officeId);
  const userName = (id: string | null) => (id ? users.find(u => u.id === id)?.name ?? 'Unknown user' : '—');
  const fields = cf.defs.filter(d => !d.officeId || d.officeId === party.officeId);
  const totalBilled = kind === 'customer' ? (party as Customer).totalSales : (party as Supplier).totalPurchases;
  const totalPaid = kind === 'customer' ? (party as Customer).amountReceived : (party as Supplier).amountPaid;

  const save = async (id: string, changes: Partial<Customer> | Partial<Supplier>) => {
    if (kind === 'customer') await updateCustomer(id, changes as Partial<Customer>);
    else await updateSupplier(id, changes as Partial<Supplier>);
    addToast({ type: 'success', title: 'Saved', message: party.name });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1">
          <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200" onClick={() => setCurrentPage(module)}>
            <ArrowLeft className="w-3.5 h-3.5" /> {kind === 'customer' ? 'Clients' : 'Suppliers'}
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">{party.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-slate-300">{code}</span>
            <span className="text-slate-400">· {typeLabel}</span>
            <StatusBadge status={party.status} size="sm" />
            <Badge variant={REG_VARIANT[party.registration.status]}>Registration {party.registration.status.toLowerCase()}</Badge>
            <span className="text-slate-400">· {office?.name ?? '—'} ({SHARING_LABEL[party.sharing].toLowerCase()})</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {party.registration.status === 'Pending' && canApprove && !ownSubmission && (
            <>
              <Button size="xs" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => setReview('Approved')}>Approve</Button>
              <Button size="xs" variant="danger" leftIcon={<XCircle className="w-3.5 h-3.5" />} onClick={() => setReview('Rejected')}>Reject</Button>
            </>
          )}
          {canEdit && <Button size="xs" variant="outline" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setEditing(true)}>Edit</Button>}
          {canEdit && <Button size="xs" variant="outline" leftIcon={<Share2 className="w-3.5 h-3.5" />} onClick={() => setSharing(true)}>Sharing</Button>}
          {canTransfer && <Button size="xs" variant="outline" leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />} onClick={() => setMoving(true)}>Transfer</Button>}
          {canPostOpening && party.registration.status === 'Approved' && (
            <Button size="xs" variant="outline" leftIcon={<Wallet className="w-3.5 h-3.5" />} onClick={() => setOpening(true)}>Post opening balance</Button>
          )}
        </div>
      </div>

      {party.registration.status !== 'Approved' && (
        <div className={`rounded-xl border p-3 text-xs ${party.registration.status === 'Rejected' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
          {party.registration.status === 'Pending'
            ? <>Waiting for approval. It cannot be used on invoices, expenses or contracts until approved.{ownSubmission && ' You submitted it, so someone else must approve it.'}</>
            : <>Rejected by {userName(party.registration.reviewedBy)}: {party.registration.note || 'no reason given'}. Editing it sends it back for approval.</>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [kind === 'customer' ? 'Billed' : 'Purchases', formatCurrency(totalBilled, currency)],
          [kind === 'customer' ? 'Received' : 'Paid', formatCurrency(totalPaid, currency)],
          [kind === 'customer' ? 'Receivable' : 'Payable', formatCurrency(party.currentBalance, currency)],
          ['Credit limit', formatCurrency(party.creditLimit, currency)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-700 bg-white p-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <Tabs variant="pills" activeTab={tab} onChange={id => setTab(id as Tab)} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'invoices', label: 'Invoices', count: partyInvoices.length, icon: <Receipt className="w-4 h-4" /> },
        { id: 'payments', label: 'Payments', count: partyPayments.length, icon: <Wallet className="w-4 h-4" /> },
        ...(hasPermission('view', 'contracts') ? [{ id: 'contracts', label: 'Contracts', icon: <FileSignature className="w-4 h-4" /> }] : []),
        { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
      ]} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <section className="rounded-2xl border border-slate-700 bg-white p-4 space-y-2">
            <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Contact & registration</h3>
            {[
              ['Contact person', party.contactPerson], ['Phone', party.phone], ['Email', party.email],
              ['Address', [party.address, party.city, party.country].filter(Boolean).join(', ')],
              ['VAT number', party.vatNumber], ['CR number', party.crNumber], ['Tax number', party.taxNumber],
              ['Payment terms', `${party.paymentTermsDays} days`],
              ['Submitted by', userName(party.registration.submittedBy)],
              ['Reviewed', party.registration.reviewedAt ? `${userName(party.registration.reviewedBy)}, ${formatDateTime(party.registration.reviewedAt)}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><span className="text-slate-400">{k}</span><span className="text-slate-200 text-right break-all">{v || '—'}</span></div>
            ))}
            {party.notes && <p className="text-slate-300 pt-2 border-t border-slate-700/60">{party.notes}</p>}
          </section>
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-700 bg-white p-4 space-y-2">
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Office & sharing</h3>
              <div className="flex justify-between"><span className="text-slate-400">Home office</span><span className="text-slate-200">{office?.name ?? '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Visible to</span>
                <span className="text-slate-200 text-right">{party.sharing === 'selected'
                  ? party.sharedOfficeIds.map(id => companies.find(c => c.id === id)?.name ?? 'Other office').join(', ')
                  : SHARING_LABEL[party.sharing]}</span></div>
              <TransferHistory entity={kind === 'customer' ? 'client' : 'supplier'} recordId={party.id} />
            </section>
            {fields.length > 0 && (
              <section className="rounded-2xl border border-slate-700 bg-white p-4 space-y-2">
                <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Additional information</h3>
                {fields.map(d => {
                  const v = party.customFields?.[d.key];
                  return (
                    <div key={d.id} className="flex justify-between gap-3">
                      <span className="text-slate-400">{d.label}</span>
                      {d.fieldType === 'file' && v
                        ? <button type="button" className="text-[#086343] font-semibold hover:underline" onClick={() => void openFileValue(v).catch(e => addToast({ type: 'error', title: 'Could not open file', message: (e as Error).message }))}>{formatCustomValue(d, v)}</button>
                        : <span className="text-slate-200 text-right">{formatCustomValue(d, v) || '—'}</span>}
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-700"><tr>
              <th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Office</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Outstanding</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/60">
              {partyInvoices.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-slate-400">No invoices yet.</td></tr>}
              {partyInvoices.map(i => (
                <tr key={i.id} className="hover:bg-slate-850/40 cursor-pointer" onClick={() => openInvoiceModal(i.id)}>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-100">{i.invoiceNumber}</td>
                  <td className="px-3 py-2 text-slate-300">{companies.find(c => c.id === i.companyId)?.code ?? ''}</td>
                  <td className="px-3 py-2 text-slate-300">{formatDate(i.invoiceDate)}</td>
                  <td className="px-3 py-2 text-slate-300">{formatDate(i.dueDate)}</td>
                  <td className="px-3 py-2"><StatusBadge status={i.paymentStatus} size="sm" /></td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(i.grandTotal, i.currency)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(i.outstandingAmount, i.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-700"><tr>
              <th className="px-3 py-2">Payment</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Amount</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/60">
              {partyPayments.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-slate-400">No payments yet.</td></tr>}
              {partyPayments.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-100">{p.paymentNumber}</td>
                  <td className="px-3 py-2 text-slate-300">{formatDate(p.paymentDate)}</td>
                  <td className="px-3 py-2 text-slate-300">{p.invoiceNumber}</td>
                  <td className="px-3 py-2 text-slate-300">{p.paymentMethod}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(p.amount, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'contracts' && <ContractsPanel partyType={partyType} party={party} />}

      {tab === 'history' && (
        <div className="rounded-2xl border border-slate-700 bg-white p-4 space-y-2 text-xs">
          {history.length === 0 && <p className="text-slate-400">No changes recorded in the loaded audit log.</p>}
          {history.map(l => (
            <div key={l.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 border-b border-slate-700/60 pb-2">
              <span className="text-slate-200"><b>{l.action}</b> · {l.details}</span>
              <span className="text-slate-400">{l.userName} · {formatDateTime(l.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {editing && (kind === 'customer'
        ? <PartyEditModal kind="customer" party={party as Customer} onClose={() => setEditing(false)} onSave={save} />
        : <PartyEditModal kind="supplier" party={party as Supplier} onClose={() => setEditing(false)} onSave={save} />)}
      {sharing && <PartySharingModal type={partyType} party={party} onClose={() => setSharing(false)} />}
      {moving && <TransferOfficeModal entity={kind === 'customer' ? 'client' : 'supplier'} record={{ id: party.id, label: party.name, officeId: party.officeId }} onClose={() => setMoving(false)} />}
      {review && (
        <ReviewModal decision={review} name={party.name} onClose={() => setReview(null)} onSubmit={async note => {
          await reviewParty(partyType, party.id, review, note);
          await reload([module]);
          addToast({ type: 'success', title: review === 'Approved' ? 'Approved' : 'Rejected', message: party.name });
        }} />
      )}
      {opening && (
        <OpeningBalanceModal name={party.name} kind={kind} onClose={() => setOpening(false)} onSubmit={async (amount, date, ref) => {
          await postOpeningPartyBalance({ companyId: party.officeId, partyType, partyId: party.id, amount, date, reference: ref });
          await reload([module, 'invoices', 'journalEntries', 'chartOfAccounts']);
          addToast({ type: 'success', title: 'Opening balance posted', message: `${formatCurrency(amount, currency)} for ${party.name}` });
        }} />
      )}
    </div>
  );
};

/** Approve / reject a registration (reason required to reject). */
export const ReviewModal: React.FC<{ decision: 'Approved' | 'Rejected'; name: string; onClose: () => void; onSubmit: (note: string) => Promise<void> }> = ({ decision, name, onClose, onSubmit }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    if (decision === 'Rejected' && !note.trim()) { setError('A reason is required to reject.'); return; }
    setBusy(true); setError(null);
    try { await onSubmit(note.trim()); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} size="sm" title={`${decision === 'Approved' ? 'Approve' : 'Reject'} ${name}`}>
      <div className="space-y-3">
        <Textarea label={decision === 'Rejected' ? 'Reason' : 'Note (optional)'} value={note} onChange={e => setNote(e.target.value)} required={decision === 'Rejected'} />
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={decision === 'Approved' ? 'primary' : 'danger'} isLoading={busy} onClick={() => void go()}>{decision === 'Approved' ? 'Approve' : 'Reject'}</Button>
        </div>
      </div>
    </Modal>
  );
};

const OpeningBalanceModal: React.FC<{ name: string; kind: Kind; onClose: () => void; onSubmit: (amount: number, date: string, ref: string) => Promise<void> }> = ({ name, kind, onClose, onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    const n = Number(amount);
    if (!(n > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (!date) { setError('Date is required.'); return; }
    setBusy(true); setError(null);
    try { await onSubmit(n, date, ref.trim()); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} size="sm" title={`Opening balance for ${name}`}
      description={`Posts an opening ${kind === 'customer' ? 'receivable' : 'payable'} invoice against 3900 Opening Balance Equity.`}>
      <div className="space-y-3">
        <Input label="Amount" type="number" step="0.001" min="0" value={amount} onChange={e => setAmount(e.target.value)} required />
        <Input label="As of date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <Input label="Reference" value={ref} onChange={e => setRef(e.target.value)} placeholder="Old system reference (optional)" />
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={busy} onClick={() => void go()}>Post</Button>
        </div>
      </div>
    </Modal>
  );
};
