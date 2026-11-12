// One expense: details and its workflow actions (submit, approve / reject, withdraw, pay, delete).
// The database enforces every rule; buttons only appear when the user may use them.
import React, { useState } from 'react';
import { Send, CheckCircle2, XCircle, Undo2, Wallet, Trash2, Paperclip } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import { VehicleExpense } from '../../types/operations';
import { deleteExpense, payExpense, reviewExpense, submitExpense } from '../../services/expenses';

export const EXPENSE_RELOAD = ['expenses', 'timeline', 'journalEntries', 'chartOfAccounts', 'bankAccounts', 'notifications'] as const;

/** Whether the current user may approve this pending expense. */
export function useMayApproveExpense() {
  const { hasPermission, canApprove, currentUser, isSuperAdmin } = useAuth();
  return (e: VehicleExpense) => e.status === 'Pending Approval' && hasPermission('approve', 'expenses', e.companyId)
    && canApprove('expense', e.total, e.companyId) && (e.submittedBy !== currentUser.id || isSuperAdmin);
}

export const ExpenseDetailModal: React.FC<{ expense: VehicleExpense; onClose: () => void; onOpenReceipt?: (e: VehicleExpense) => void }> = ({ expense: e, onClose, onOpenReceipt }) => {
  const { companies, bankAccounts, currency, reload } = useFleet();
  const { hasPermission, currentUser, isSuperAdmin } = useAuth();
  const { addToast } = useUI();
  const mayApprove = useMayApproveExpense()(e);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<null | 'Rejected' | 'Approved' | 'pay'>(null);
  const [note, setNote] = useState('');
  const banks = bankAccounts.filter(b => b.companyId === e.companyId && b.active !== false);
  const [pay, setPay] = useState({ bankId: banks[0]?.id ?? '', date: localToday() });
  const office = companies.find(c => c.id === e.companyId)?.name ?? '—';
  const bank = bankAccounts.find(b => b.id === e.bankAccountId);
  const editable = e.status === 'Draft' || e.status === 'Rejected';
  const mine = e.submittedBy === currentUser.id;

  const act = async (label: string, fn: () => Promise<unknown>, ok: (r: unknown) => string, close = false) => {
    setBusy(label); setErr(null);
    try {
      const r = await fn();
      await reload([...EXPENSE_RELOAD]);
      addToast({ type: 'success', title: ok(r), message: e.expenseNumber });
      setMode(null); setNote('');
      if (close) onClose();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(null); }
  };

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 border-b border-slate-800 text-xs"><span className="text-slate-400">{k}</span><span className="text-slate-100 text-right">{v}</span></div>
  );

  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="md"
      title={<div className="flex items-center gap-2"><span>{e.expenseNumber}</span><StatusBadge status={e.status} size="sm" /><StatusBadge status={e.paymentStatus} size="sm" /></div>}
      description={e.description}>
      <div className="space-y-4">
        <div>
          {row('Office', office)}
          {row('Date', formatDate(e.date))}
          {row('Category', `${e.category}${e.glAccountCode ? ` · GL ${e.glAccountCode}` : ''}`)}
          {e.vehiclePlate && row('Vehicle', e.vehiclePlate)}
          {e.employeeName && row('Employee', e.employeeName)}
          {e.supplierName && row('Supplier', e.supplierName)}
          {row('Net', formatCurrency(e.total - e.tax, currency))}
          {row('VAT', formatCurrency(e.tax, currency))}
          {row('Total', <strong>{formatCurrency(e.total, currency)}</strong>)}
          {row('Payment', `${e.paymentMethod}${bank ? ` · ${bank.bankName} ${bank.accountName}` : ''}${e.paidDate ? ` · paid ${formatDate(e.paidDate)}` : ''}`)}
          {e.costCentre && row('Cost centre', e.costCentre)}
          {e.recurringExpenseId && row('Source', 'Monthly recurring expense')}
          {row('Ledger', e.journalEntryId ? 'Posted' : e.status === 'Approved' ? 'Recorded before ledger posting was added' : 'Not posted yet')}
        </div>
        {e.reviewNote && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">Review note: {e.reviewNote}</p>}
        {err && <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</p>}

        {mode === 'Rejected' || mode === 'Approved' ? (
          <div className="space-y-2">
            <Textarea label={mode === 'Rejected' ? 'Reason (required)' : 'Note (optional)'} value={note} onChange={x => setNote(x.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode(null)} disabled={!!busy}>Back</Button>
              <Button variant={mode === 'Approved' ? 'success' : 'danger'} size="sm" isLoading={busy === 'review'} disabled={!!busy || (mode === 'Rejected' && !note.trim())}
                onClick={() => void act('review', () => reviewExpense(e.id, mode, note), () => (mode === 'Approved' ? 'Expense approved and posted' : 'Expense rejected'))}>Confirm</Button>
            </div>
          </div>
        ) : mode === 'pay' ? (
          <div className="space-y-2">
            <Select label="Paid from" value={pay.bankId} onChange={x => setPay({ ...pay, bankId: x.target.value })}>
              <option value="">Choose…</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} · {b.accountName}</option>)}
            </Select>
            <Input label="Payment date" type="date" value={pay.date} onChange={x => setPay({ ...pay, date: x.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode(null)} disabled={!!busy}>Back</Button>
              <Button size="sm" isLoading={busy === 'pay'} disabled={!!busy || !pay.bankId || !pay.date}
                onClick={() => void act('pay', () => payExpense(e.id, pay.bankId, pay.date), () => 'Payment recorded')}>Record payment</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 justify-end">
            {e.attachmentUrl && onOpenReceipt && <Button variant="ghost" size="sm" leftIcon={<Paperclip className="w-4 h-4" />} onClick={() => onOpenReceipt(e)}>Receipt</Button>}
            {editable && hasPermission('delete', 'expenses', e.companyId) && (
              <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-4 h-4" />} disabled={!!busy}
                onClick={() => { if (window.confirm(`Delete ${e.expenseNumber}?`)) void act('del', () => deleteExpense(e.id), () => 'Expense deleted', true); }}>Delete</Button>
            )}
            {editable && hasPermission('create', 'expenses', e.companyId) && (
              <Button size="sm" leftIcon={<Send className="w-4 h-4" />} isLoading={busy === 'submit'} disabled={!!busy}
                onClick={() => void act('submit', () => submitExpense(e.id), r => (r === 'Approved' ? 'Expense approved and posted' : 'Sent for approval'))}>
                {e.status === 'Rejected' ? 'Resubmit' : 'Submit'}
              </Button>
            )}
            {e.status === 'Pending Approval' && (mine || isSuperAdmin) && (
              <Button variant="outline" size="sm" leftIcon={<Undo2 className="w-4 h-4" />} isLoading={busy === 'wd'} disabled={!!busy}
                onClick={() => void act('wd', () => reviewExpense(e.id, 'Withdrawn'), () => 'Expense withdrawn to draft')}>Withdraw</Button>
            )}
            {mayApprove && <>
              <Button variant="danger" size="sm" leftIcon={<XCircle className="w-4 h-4" />} disabled={!!busy} onClick={() => setMode('Rejected')}>Reject</Button>
              <Button variant="success" size="sm" leftIcon={<CheckCircle2 className="w-4 h-4" />} disabled={!!busy} onClick={() => setMode('Approved')}>Approve</Button>
            </>}
            {e.status === 'Pending Approval' && !mayApprove && !mine && <span className="text-xs text-slate-400 self-center">Waiting for an approver with a high enough limit</span>}
            {e.status === 'Pending Approval' && mine && !isSuperAdmin && <span className="text-xs text-slate-400 self-center">Another approver must review it</span>}
            {e.status === 'Approved' && e.paymentStatus === 'Unpaid' && e.journalEntryId && hasPermission('create', 'payments', e.companyId) && (
              <Button size="sm" leftIcon={<Wallet className="w-4 h-4" />} disabled={!!busy || banks.length === 0} onClick={() => setMode('pay')}>Pay</Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
