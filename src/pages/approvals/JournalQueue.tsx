// Manual journals above the requester's journal limit (Approvals → Journals). The database posts
// the journal on approval, checks the approver's limit and blocks approving your own request.
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { JournalRequest, fetchJournalRequests, reviewJournalRequest } from '../../services/ledger';
import { tableCls, tdCls, thCls } from '../setup/shared';

export function usePendingJournals() {
  const [rows, setRows] = useState<JournalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRows(await fetchJournalRequests('Pending')); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { rows, error, reload: load };
}

export const JournalQueue: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { companies, currency, selectedCompanyId, reload } = useFleet();
  const { hasPermission, canApprove, currentUser, isSuperAdmin } = useAuth();
  const { addToast } = useUI();
  const { rows: all, error, reload: reloadQueue } = usePendingJournals();
  const rows = selectedCompanyId === 'all' ? all : all.filter(r => r.companyId === selectedCompanyId);
  const [acting, setActing] = useState<{ r: JournalRequest; decision: 'Approved' | 'Rejected' | 'Cancelled' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const office = (id: string) => companies.find(c => c.id === id)?.name ?? '—';

  const go = async () => {
    if (!acting) return;
    if (acting.decision === 'Rejected' && !note.trim()) { setErr('Give a reason for rejecting.'); return; }
    setBusy(true); setErr(null);
    try {
      await reviewJournalRequest(acting.r.id, acting.decision, note);
      await Promise.all([reloadQueue(), reload(['journalEntries', 'chartOfAccounts', 'notifications'])]);
      addToast({ type: 'success', title: `Journal ${acting.decision.toLowerCase()}`, message: acting.r.requestNumber });
      setActing(null); setNote(''); onChanged?.();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (error) return <p role="alert" className="text-xs text-rose-500">{error}</p>;
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
      <table className={tableCls}>
        <thead><tr><th className={thCls}>Request</th><th className={thCls}>Office</th><th className={thCls}>Date</th><th className={thCls}>Lines</th><th className={`${thCls} text-right`}>Amount</th><th className={thCls} /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className={tdCls} colSpan={6}>No journals waiting for approval.</td></tr>}
          {rows.map(r => {
            const mine = r.requestedBy === currentUser.id;
            const may = hasPermission('approve', 'accounting', r.companyId) && canApprove('journal', r.total, r.companyId) && (!mine || isSuperAdmin);
            return (
              <tr key={r.id}>
                <td className={tdCls}><p className="font-semibold text-slate-100">{r.requestNumber} · {r.description}</p><p className="text-[11px] text-slate-400">by {r.requestedByName || '—'}{r.reference ? ` · ref ${r.reference}` : ''}</p></td>
                <td className={tdCls}>{office(r.companyId)}</td>
                <td className={tdCls}>{formatDate(r.entryDate)}</td>
                <td className={tdCls}>
                  {r.lines.map((l, i) => <p key={i} className="text-[11px] font-mono text-slate-300">{l.account_code} {l.debit ? `Dr ${Number(l.debit).toFixed(3)}` : `Cr ${Number(l.credit).toFixed(3)}`}</p>)}
                </td>
                <td className={`${tdCls} text-right font-mono font-bold`}>{formatCurrency(r.total, currency)}</td>
                <td className={`${tdCls} text-right`}>
                  <div className="flex justify-end gap-1 flex-wrap">
                    {may && <Button variant="ghost" size="xs" leftIcon={<CheckCircle2 className="w-3 h-3" />} onClick={() => setActing({ r, decision: 'Approved' })}>Approve</Button>}
                    {may && <Button variant="ghost" size="xs" leftIcon={<XCircle className="w-3 h-3" />} onClick={() => setActing({ r, decision: 'Rejected' })}>Reject</Button>}
                    {mine && <Button variant="ghost" size="xs" leftIcon={<Undo2 className="w-3 h-3" />} onClick={() => setActing({ r, decision: 'Cancelled' })}>Withdraw</Button>}
                    {!may && !mine && <Badge variant="slate">Needs a higher limit</Badge>}
                    {mine && !isSuperAdmin && hasPermission('approve', 'accounting', r.companyId) && <span className="text-[10px] text-slate-400 self-center">Another approver must review</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {acting && (
        <Modal isOpen onClose={busy ? () => undefined : () => setActing(null)} size="sm" title={`${acting.decision === 'Approved' ? 'Approve' : acting.decision === 'Rejected' ? 'Reject' : 'Withdraw'} ${acting.r.requestNumber}`}
          description={acting.decision === 'Approved' ? `Posts ${formatCurrency(acting.r.total, currency)} to the ledger dated ${formatDate(acting.r.entryDate)}.` : acting.r.description}>
          <div className="space-y-3">
            <Textarea label={acting.decision === 'Rejected' ? 'Reason (required)' : 'Note (optional)'} value={note} onChange={e => setNote(e.target.value)} />
            {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActing(null)} disabled={busy}>Back</Button>
              <Button variant={acting.decision === 'Approved' ? 'success' : 'danger'} onClick={() => void go()} isLoading={busy} disabled={busy}>Confirm</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
