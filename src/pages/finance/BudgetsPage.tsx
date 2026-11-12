// Finance → Budgets. One approved budget per office and year, with monthly amounts per income or
// expense account. Draft → Submitted → Approved (another approver, within the budget limit) and
// budget vs actual from posted journals.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Send, CheckCircle2, XCircle, RotateCcw, Trash2, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { consolidateAccounts } from '../../services/accounting';
import { tableCls, tdCls, thCls } from '../setup/shared';
import {
  Budget, BudgetActual, createBudget, deleteBudget, fetchBudgetVsActual, fetchBudgets, reviewBudget, saveBudgetAccount, submitBudget,
} from '../../services/ledger';
import { PageHeader } from '../../components/ui/PageHeader';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_VARIANT = { Draft: 'slate', Submitted: 'amber', Approved: 'emerald', Rejected: 'rose' } as const;

export const BudgetsPage: React.FC = () => {
  const { companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  const offices = companies.filter(c => hasPermission('view', 'budgets', c.id));
  const [officeId, setOfficeId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState('budgets');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!offices.some(o => o.id === officeId)) setOfficeId(offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? '');
  }, [offices, officeId, selectedCompanyId]);
  const load = useCallback(async () => {
    try { setBudgets(await fetchBudgets(year)); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, [year]);
  useEffect(() => { void load(); }, [load]);
  const mine = budgets.filter(b => b.companyId === officeId);
  const open = budgets.find(b => b.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Monthly budgets per account, approved by finance, compared with actual postings."
        actions={
          <>
            {officeId && hasPermission('create', 'budgets', officeId) && <Button size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>New budget</Button>}
          </>
        }
      />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-56"><Select label="Office" value={officeId} onChange={e => setOfficeId(e.target.value)}>
          {offices.length === 0 && <option value="">No office available</option>}
          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select></div>
        <div className="w-32"><Select label="Year" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[1, 0, -1, -2].map(n => new Date().getFullYear() + n).map(y => <option key={y} value={y}>{y}</option>)}
        </Select></div>
        <Tabs variant="segmented" tabs={[{ id: 'budgets', label: 'Budgets' }, { id: 'actual', label: 'Budget vs actual' }]} activeTab={tab} onChange={setTab} />
      </div>
      {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
      {tab === 'budgets' ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
          <table className={tableCls}>
            <thead><tr><th scope="col" className={thCls}>Budget</th><th scope="col" className={`${thCls} text-right`}>Expenses</th><th scope="col" className={`${thCls} text-right`}>Income</th><th scope="col" className={thCls}>Status</th><th scope="col" className={thCls}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {mine.length === 0 && <tr><td className={tdCls} colSpan={5}>No budgets for {year} in this office.</td></tr>}
              {mine.map(b => <BudgetRow key={b.id} b={b} officeId={officeId} onOpen={() => setOpenId(b.id)} />)}
            </tbody>
          </table>
        </div>
      ) : officeId ? <BudgetVsActual officeId={officeId} year={year} /> : null}
      {creating && <CreateModal officeId={officeId} year={year} onClose={() => setCreating(false)} onCreated={async id => { await load(); setCreating(false); setOpenId(id); }} />}
      {open && <BudgetModal budget={open} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

const BudgetRow: React.FC<{ b: Budget; officeId: string; onOpen: () => void }> = ({ b, officeId, onOpen }) => {
  const { chartOfAccounts, currency } = useFleet();
  const accounts = consolidateAccounts(chartOfAccounts, officeId);
  const sum = (cat: string) => b.lines.filter(l => accounts.find(a => a.code === l.accountCode)?.category === cat).reduce((t, l) => t + l.amount, 0);
  return (
    <tr>
      <td className={tdCls}><button type="button" className="font-semibold text-slate-100 hover:text-forest-400" onClick={onOpen}>{b.name}</button>{b.reviewNote && <p className="text-[11px] text-slate-400">{b.reviewNote}</p>}</td>
      <td className={`${tdCls} text-right font-mono`}>{formatCurrency(sum('Expense'), currency)}</td>
      <td className={`${tdCls} text-right font-mono`}>{formatCurrency(sum('Revenue'), currency)}</td>
      <td className={tdCls}><Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge></td>
      <td className={`${tdCls} text-right`}><Button variant="ghost" size="xs" onClick={onOpen}>Open</Button></td>
    </tr>
  );
};

const CreateModal: React.FC<{ officeId: string; year: number; onClose: () => void; onCreated: (id: string) => Promise<void> }> = ({ officeId, year, onClose, onCreated }) => {
  const [name, setName] = useState(`Operating budget ${year}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onCreated(await createBudget({ companyId: officeId, year, name })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title={`New budget ${year}`}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void go()} isLoading={busy} disabled={busy || !name.trim()}>Create</Button></div>
      </div>
    </Modal>
  );
};

const BudgetModal: React.FC<{ budget: Budget; onClose: () => void; onChanged: () => Promise<void> }> = ({ budget: b, onClose, onChanged }) => {
  const { chartOfAccounts, currency } = useFleet();
  const { hasPermission, canApprove, currentUser, isSuperAdmin } = useAuth();
  const { addToast } = useUI();
  const accounts = useMemo(() => consolidateAccounts(chartOfAccounts, b.companyId).filter(a => a.category === 'Expense' || a.category === 'Revenue'), [chartOfAccounts, b.companyId]);
  const editable = (b.status === 'Draft' || b.status === 'Rejected') && hasPermission('edit', 'budgets', b.companyId);
  const initial = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const l of b.lines) { (m[l.accountCode] ??= Array(12).fill(0))[l.month - 1] = l.amount; }
    return m;
  }, [b.lines]);
  const [grid, setGrid] = useState<Record<string, number[]>>(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<'Approved' | 'Rejected' | 'Reopen' | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { setGrid(initial); setDirty(new Set()); }, [initial]);
  const codes = Object.keys(grid).sort();
  const expenseTotal = codes.filter(c => accounts.find(a => a.code === c)?.category === 'Expense').reduce((t, c) => t + grid[c].reduce((x, y) => x + y, 0), 0);
  const mineSubmitted = b.submittedBy === currentUser.id && !isSuperAdmin;
  const canReview = hasPermission('approve', 'budgets', b.companyId);

  const act = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label); setErr(null);
    try { await fn(); await onChanged(); addToast({ type: 'success', title: ok, message: b.name }); return true; }
    catch (e) { setErr((e as Error).message); return false; } finally { setBusy(null); }
  };
  const saveAll = () => act('save', async () => { for (const c of dirty) await saveBudgetAccount(b, c, grid[c]); setDirty(new Set()); }, 'Budget saved');
  const set = (code: string, i: number, v: number) => { setGrid(g => ({ ...g, [code]: g[code].map((x, j) => (j === i ? v : x)) })); setDirty(d => new Set(d).add(code)); };
  const spread = (code: string) => { const total = grid[code].reduce((x, y) => x + y, 0); const per = Math.floor((total / 12) * 1000) / 1000; const last = Math.round((total - per * 11) * 1000) / 1000;
    setGrid(g => ({ ...g, [code]: [...Array(11).fill(per), last] })); setDirty(d => new Set(d).add(code)); };

  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="2xl" title={`${b.name} · ${b.year}`} description={`${b.status}. Expenses ${formatCurrency(expenseTotal, currency)}${b.reviewNote ? ` · ${b.reviewNote}` : ''}`}>
      <div className="space-y-4">
        {err && <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex flex-wrap gap-2 items-end">
          {editable && <>
            <div className="w-full sm:w-72"><Select label="Add account" value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.filter(a => !grid[a.code]).map(a => <option key={a.code} value={a.code}>{a.code} {a.name} ({a.category === 'Revenue' ? 'income' : 'expense'})</option>)}
            </Select></div>
            <Button variant="outline" size="sm" disabled={!adding} onClick={() => { setGrid(g => ({ ...g, [adding]: Array(12).fill(0) })); setAdding(''); }}>Add</Button>
            <Button size="sm" leftIcon={<Save className="w-4 h-4" />} isLoading={busy === 'save'} disabled={!!busy || dirty.size === 0} onClick={() => void saveAll()}>Save</Button>
            <Button variant="secondary" size="sm" leftIcon={<Send className="w-4 h-4" />} isLoading={busy === 'submit'} disabled={!!busy || dirty.size > 0 || b.lines.length === 0}
              onClick={() => void act('submit', () => submitBudget(b.id), 'Submitted for approval')}>Submit</Button>
          </>}
          {b.status === 'Submitted' && canReview && !mineSubmitted && <>
            <Button variant="success" size="sm" leftIcon={<CheckCircle2 className="w-4 h-4" />} disabled={!!busy || !canApprove('budget', expenseTotal, b.companyId)} onClick={() => setReview('Approved')}>Approve</Button>
            <Button variant="danger" size="sm" leftIcon={<XCircle className="w-4 h-4" />} disabled={!!busy} onClick={() => setReview('Rejected')}>Reject</Button>
            {!canApprove('budget', expenseTotal, b.companyId) && <span className="text-xs text-slate-400 self-center">Above your budget approval limit</span>}
          </>}
          {b.status === 'Submitted' && mineSubmitted && <span className="text-xs text-slate-400">You submitted this budget; another approver must review it.</span>}
          {b.status === 'Approved' && canReview && <Button variant="outline" size="sm" leftIcon={<RotateCcw className="w-4 h-4" />} onClick={() => setReview('Reopen')}>Reopen for changes</Button>}
          {(b.status === 'Draft' || b.status === 'Rejected') && hasPermission('delete', 'budgets', b.companyId) && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-4 h-4" />} disabled={!!busy}
              onClick={() => { if (window.confirm('Delete this budget?')) void act('del', () => deleteBudget(b.id), 'Budget deleted').then(ok => ok && onClose()); }}>Delete</Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className={tableCls}>
            <thead><tr><th scope="col" className={thCls}>Account</th>{MONTHS.map(m => <th scope="col" key={m} className={`${thCls} text-right`}>{m}</th>)}<th scope="col" className={`${thCls} text-right`}>Year</th>{editable && <th scope="col" className={thCls}><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {codes.length === 0 && <tr><td className={tdCls} colSpan={15}>No accounts yet. Add an income or expense account above.</td></tr>}
              {codes.map(c => { const a = accounts.find(x => x.code === c); return (
                <tr key={c}>
                  <td className={tdCls}><p className="font-semibold text-slate-100 whitespace-nowrap">{c} {a?.name}</p><p className="text-[10px] text-slate-400">{a?.category === 'Revenue' ? 'Income' : 'Expense'}</p></td>
                  {grid[c].map((v, i) => (
                    <td key={i} className={`${tdCls} text-right`}>{editable
                      ? <input type="number" min={0} step="0.001" aria-label={`${c} ${MONTHS[i]}`} className="w-20 bg-slate-850 border border-slate-700 rounded px-1 py-0.5 text-right text-xs" value={v} onChange={e => set(c, i, Math.max(0, Number(e.target.value)))} />
                      : <span className="font-mono">{v ? v.toFixed(0) : '—'}</span>}</td>
                  ))}
                  <td className={`${tdCls} text-right font-mono font-bold`}>{grid[c].reduce((x, y) => x + y, 0).toFixed(3)}</td>
                  {editable && <td className={tdCls}><Button variant="ghost" size="xs" onClick={() => spread(c)} title="Spread the year total evenly over 12 months">Spread</Button></td>}
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </div>
      {review && (
        <Modal isOpen onClose={() => setReview(null)} size="sm" title={review === 'Reopen' ? 'Reopen budget' : `${review === 'Approved' ? 'Approve' : 'Reject'} budget`}>
          <div className="space-y-3">
            <Textarea label={review === 'Approved' ? 'Note (optional)' : 'Reason (required)'} value={note} onChange={e => setNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReview(null)}>Back</Button>
              <Button variant={review === 'Approved' ? 'success' : 'danger'} isLoading={busy === 'review'} disabled={!!busy || (review !== 'Approved' && !note.trim())}
                onClick={() => void act('review', () => reviewBudget(b.id, review, note), review === 'Reopen' ? 'Budget reopened' : `Budget ${review.toLowerCase()}`).then(ok => { if (ok) { setReview(null); setNote(''); } })}>Confirm</Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
};

const BudgetVsActual: React.FC<{ officeId: string; year: number }> = ({ officeId, year }) => {
  const { currency } = useFleet();
  const [rows, setRows] = useState<BudgetActual[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [upTo, setUpTo] = useState(year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  useEffect(() => { setUpTo(year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12); }, [year]);
  useEffect(() => { fetchBudgetVsActual(officeId, year).then(r => { setRows(r); setErr(null); }).catch(e => setErr((e as Error).message)); }, [officeId, year]);
  const accounts = Array.from(new Map(rows.map(r => [r.accountCode, r])).values());
  const sum = (code: string, k: 'budget' | 'actual') => rows.filter(r => r.accountCode === code && r.month <= upTo).reduce((t, r) => t + r[k], 0);
  return (
    <div className="space-y-3">
      <div className="w-48"><Select label="Year to date, through" value={upTo} onChange={e => setUpTo(Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select></div>
      {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
        <table className={tableCls}>
          <thead><tr><th scope="col" className={thCls}>Account</th><th scope="col" className={`${thCls} text-right`}>Budget</th><th scope="col" className={`${thCls} text-right`}>Actual</th><th scope="col" className={`${thCls} text-right`}>Variance</th><th scope="col" className={`${thCls} text-right`}>Used</th></tr></thead>
          <tbody>
            {accounts.length === 0 && <tr><td className={tdCls} colSpan={5}>No approved budget and no postings for {year}.</td></tr>}
            {accounts.map(a => {
              const bud = sum(a.accountCode, 'budget'); const act = sum(a.accountCode, 'actual');
              const pct = bud > 0 ? (act / bud) * 100 : null;
              const exp = a.category === 'Expense';
              const warn = exp && pct != null && pct >= 80;
              return (
                <tr key={a.accountCode}>
                  <td className={tdCls}><p className="font-semibold text-slate-100">{a.accountCode} {a.accountName}</p><p className="text-[10px] text-slate-400">{exp ? 'Expense' : 'Income'}</p></td>
                  <td className={`${tdCls} text-right font-mono`}>{formatCurrency(bud, currency)}</td>
                  <td className={`${tdCls} text-right font-mono`}>{formatCurrency(act, currency)}</td>
                  <td className={`${tdCls} text-right font-mono ${(exp ? act > bud : act < bud) ? 'text-rose-500' : 'text-emerald-500'}`}>{formatCurrency(exp ? bud - act : act - bud, currency)}</td>
                  <td className={`${tdCls} text-right`}>{pct == null ? <span className="text-slate-400">No budget</span>
                    : <Badge variant={exp ? (pct >= 100 ? 'rose' : warn ? 'amber' : 'emerald') : 'slate'}>{pct.toFixed(0)}%</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
