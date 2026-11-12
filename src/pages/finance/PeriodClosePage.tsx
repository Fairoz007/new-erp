// Finance → Period close. A closed month rejects every posting for that office (invoices,
// payments, payroll, journals, depreciation, disposals). Closing and reopening need accounting
// approve rights; reopening needs a reason. All of it is recorded in the audit log.
import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Select, Textarea } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatDateTime } from '../../utils/date';
import { AccountingPeriod, closePeriod, fetchPeriods, reopenPeriod } from '../../services/ledger';
import { tableCls, tdCls, thCls } from '../setup/shared';
import { PageHeader } from '../../components/ui/PageHeader';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const PeriodClosePage: React.FC = () => {
  const { companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const offices = companies.filter(c => hasPermission('view', 'accounting', c.id));
  const [officeId, setOfficeId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<{ month: number; close: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!offices.some(o => o.id === officeId)) setOfficeId(offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? '');
  }, [offices, officeId, selectedCompanyId]);
  const load = useCallback(async () => { try { setPeriods(await fetchPeriods()); setErr(null); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const canAct = !!officeId && hasPermission('approve', 'accounting', officeId);
  const now = new Date();
  const ended = (m: number) => year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth() + 1);

  const go = async () => {
    if (!acting) return;
    setBusy(true); setErr(null);
    try {
      if (acting.close) await closePeriod(officeId, year, acting.month, note);
      else await reopenPeriod(officeId, year, acting.month, note);
      await load();
      addToast({ type: 'success', title: `${MONTHS[acting.month - 1]} ${year} ${acting.close ? 'closed' : 'reopened'}`, message: offices.find(o => o.id === officeId)?.name ?? '' });
      setActing(null); setNote('');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Period close" description="Close a month once its books are final. Nothing can be posted into a closed month until it is reopened." />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-56"><Select label="Office" value={officeId} onChange={e => setOfficeId(e.target.value)}>
          {offices.length === 0 && <option value="">No office available</option>}
          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select></div>
        <div className="w-32"><Select label="Year" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[0, -1, -2, -3].map(n => now.getFullYear() + n).map(y => <option key={y} value={y}>{y}</option>)}
        </Select></div>
      </div>
      {err && !acting && <p role="alert" className="text-xs text-rose-500">{err}</p>}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
        <table className={tableCls}>
          <thead><tr><th scope="col" className={thCls}>Month</th><th scope="col" className={thCls}>Status</th><th scope="col" className={thCls}>Last change</th><th scope="col" className={thCls}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {MONTHS.map((name, i) => {
              const p = periods.find(x => x.companyId === officeId && x.year === year && x.month === i + 1);
              const closed = p?.status === 'Closed';
              return (
                <tr key={name}>
                  <td className={tdCls}>{name} {year}</td>
                  <td className={tdCls}><Badge variant={closed ? 'slate' : 'emerald'}>{closed ? 'Closed' : ended(i + 1) ? 'Open' : 'Current / future'}</Badge></td>
                  <td className={tdCls}><span className="text-xs text-slate-400">{p ? `${closed ? 'Closed' : 'Reopened'} ${formatDateTime(closed ? p.closedAt : p.reopenedAt)}${p.note ? ` · ${p.note}` : ''}` : '—'}</span></td>
                  <td className={`${tdCls} text-right`}>
                    {canAct && !closed && ended(i + 1) && <Button variant="outline" size="xs" leftIcon={<Lock className="w-3 h-3" />} onClick={() => { setActing({ month: i + 1, close: true }); setErr(null); }}>Close</Button>}
                    {canAct && closed && <Button variant="ghost" size="xs" leftIcon={<Unlock className="w-3 h-3" />} onClick={() => { setActing({ month: i + 1, close: false }); setErr(null); }}>Reopen</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {acting && (
        <Modal isOpen onClose={busy ? () => undefined : () => setActing(null)} size="sm" title={`${acting.close ? 'Close' : 'Reopen'} ${MONTHS[acting.month - 1]} ${year}`}
          description={acting.close ? 'Postings dated in this month will be rejected. Payroll for the month must be approved first.' : 'Postings into this month will be allowed again.'}>
          <div className="space-y-3">
            <Textarea label={acting.close ? 'Note (optional)' : 'Reason (required)'} value={note} onChange={e => setNote(e.target.value)} />
            {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActing(null)} disabled={busy}>Back</Button>
              <Button variant={acting.close ? 'primary' : 'danger'} onClick={() => void go()} isLoading={busy} disabled={busy || (!acting.close && !note.trim())}>{acting.close ? 'Close month' : 'Reopen month'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
