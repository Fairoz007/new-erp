// Finance → Bank reconciliation. Enter or import a bank statement, match each statement line to a
// bank line in the ledger (auto-match by amount and date, or by hand), book missing items (bank
// charges, interest) as journals, then complete. The database checks amounts, the bank account and
// that opening + lines = closing, and locks the statement once reconciled.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, Plus, Upload, Wand2, CheckCircle2, Trash2, Link2, Unlink, Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import { parseCsv, tableCls, tdCls, thCls } from '../setup/shared';
import {
  BankStatement, BookLine, StatementLine, StatementLineInput, addStatementLines, autoMatchStatement, completeReconciliation,
  createBankStatement, deleteBankStatement, deleteStatementLine, fetchBankStatements, fetchBookLines, fetchStatementLines,
  matchStatementLine, validateStatementLine,
} from '../../services/ledger';
import { PageHeader } from '../../components/ui/PageHeader';

export const BankReconciliationPage: React.FC = () => {
  const { bankAccounts, selectedCompanyId, currency } = useFleet();
  const { hasPermission } = useAuth();
  const banks = bankAccounts.filter(b => (selectedCompanyId === 'all' || b.companyId === selectedCompanyId) && hasPermission('view', 'reconciliation', b.companyId));
  const [bankId, setBankId] = useState('');
  const bank = banks.find(b => b.id === bankId);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!banks.some(b => b.id === bankId)) setBankId(banks[0]?.id ?? ''); }, [banks, bankId]);
  const load = useCallback(async () => {
    if (!bankId) { setStatements([]); return; }
    try { setStatements(await fetchBankStatements(bankId)); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, [bankId]);
  useEffect(() => { void load(); }, [load]);
  const open = statements.find(s => s.id === openId) ?? null;
  const cur = bank?.currency || currency;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank reconciliation"
        description="Match bank statement lines to the ledger, book what is missing, then lock the statement."
        actions={
          <>
            {bank && hasPermission('create', 'reconciliation', bank.companyId) && <Button size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>New statement</Button>}
          </>
        }
      />
      <div className="w-80">
        <Select label="Bank account" value={bankId} onChange={e => { setBankId(e.target.value); setOpenId(null); }}>
          {banks.length === 0 && <option value="">No bank account you can reconcile</option>}
          {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} · {b.accountName} ({b.accountNumber})</option>)}
        </Select>
      </div>
      {bank && <p className="text-xs text-slate-400">Ledger balance today: <b className="text-slate-200">{formatCurrency(bank.currentBalance, cur)}</b></p>}
      {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
        <table className={tableCls}>
          <thead><tr><th className={thCls}>Period</th><th className={`${thCls} text-right`}>Opening</th><th className={`${thCls} text-right`}>Closing</th><th className={thCls}>Status</th><th className={thCls} /></tr></thead>
          <tbody>
            {statements.length === 0 && <tr><td className={tdCls} colSpan={5}>No statements yet for this account.</td></tr>}
            {statements.map(s => (
              <tr key={s.id}>
                <td className={tdCls}>{formatDate(s.periodStart)} – {formatDate(s.periodEnd)}</td>
                <td className={`${tdCls} text-right font-mono`}>{s.openingBalance.toFixed(3)}</td>
                <td className={`${tdCls} text-right font-mono`}>{s.closingBalance.toFixed(3)}</td>
                <td className={tdCls}><Badge variant={s.status === 'Reconciled' ? 'emerald' : 'amber'}>{s.status}</Badge></td>
                <td className={`${tdCls} text-right`}><Button variant="ghost" size="xs" onClick={() => setOpenId(s.id)}>Open</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && bank && <NewStatementModal bankId={bank.id} companyId={bank.companyId} last={statements[0]} onClose={() => setCreating(false)}
        onCreated={async s => { await load(); setCreating(false); setOpenId(s.id); }} />}
      {open && bank && <StatementModal statement={open} currency={cur} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

const NewStatementModal: React.FC<{ bankId: string; companyId: string; last?: BankStatement; onClose: () => void; onCreated: (s: BankStatement) => Promise<void> }> = ({ bankId, companyId, last, onClose, onCreated }) => {
  const nextStart = last ? new Date(new Date(`${last.periodEnd}T00:00:00`).getTime() + 86400000).toLocaleDateString('en-CA') : '';
  const [v, setV] = useState({ periodStart: nextStart, periodEnd: localToday(), opening: last?.closingBalance ?? 0, closing: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onCreated(await createBankStatement({ companyId, bankAccountId: bankId, periodStart: v.periodStart, periodEnd: v.periodEnd, openingBalance: v.opening, closingBalance: v.closing })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title="New bank statement" description="Use the dates and balances printed on the bank statement.">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" value={v.periodStart} onChange={e => setV({ ...v, periodStart: e.target.value })} />
          <Input label="To" type="date" value={v.periodEnd} onChange={e => setV({ ...v, periodEnd: e.target.value })} />
          <Input label="Opening balance" type="number" step="0.001" value={v.opening} onChange={e => setV({ ...v, opening: Number(e.target.value) })} />
          <Input label="Closing balance" type="number" step="0.001" value={v.closing} onChange={e => setV({ ...v, closing: Number(e.target.value) })} />
        </div>
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void go()} isLoading={busy} disabled={busy || !v.periodStart || !v.periodEnd}>Create</Button></div>
      </div>
    </Modal>
  );
};

const StatementModal: React.FC<{ statement: BankStatement; currency: string; onClose: () => void; onChanged: () => Promise<void> }> = ({ statement: s, currency, onClose, onChanged }) => {
  const { hasPermission } = useAuth();
  const { addToast, setCurrentPage } = useUI();
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [book, setBook] = useState<BookLine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<StatementLine | null>(null);
  const [newLine, setNewLine] = useState<StatementLineInput>({ txnDate: s.periodStart, description: '', reference: '', amount: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = s.status === 'Reconciled';
  const canEdit = !locked && hasPermission('edit', 'reconciliation', s.companyId);
  const canAdd = !locked && hasPermission('create', 'reconciliation', s.companyId);

  const load = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([fetchStatementLines(s.id), fetchBookLines(s.bankAccountId, s.periodStart, s.periodEnd)]);
      setLines(l); setBook(b); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [s.id, s.bankAccountId, s.periodStart, s.periodEnd]);
  useEffect(() => { void load(); }, [load]);

  const total = lines.reduce((t, l) => t + l.amount, 0);
  const diff = Math.round((s.openingBalance + total - s.closingBalance) * 1000) / 1000;
  const unmatched = lines.filter(l => !l.journalLineId).length;
  const uncleared = book.filter(b => !b.statementLineId);
  const bookById = useMemo(() => new Map(book.map(b => [b.journalLineId, b])), [book]);

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label); setErr(null);
    try { const r = await fn(); await load(); if (ok) addToast({ type: 'success', title: ok, message: typeof r === 'number' ? `${r} line(s)` : '' }); return true; }
    catch (e) { setErr((e as Error).message); return false; } finally { setBusy(null); }
  };

  const importCsv = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) { setErr('File is larger than 2 MB.'); return; }
    const { headers, rows } = parseCsv(await f.text());
    if (!['date', 'description', 'amount'].every(h => headers.includes(h))) { setErr('The CSV needs columns: date, description, amount (and optional reference). Money out is negative.'); return; }
    const parsed = rows.map(r => ({ txnDate: (r.date ?? '').trim(), description: (r.description ?? '').trim(), reference: (r.reference ?? '').trim(), amount: Number((r.amount ?? '').replace(/,/g, '')) }));
    const bad = parsed.map((l, i) => [i + 2, validateStatementLine(l)] as const).filter(([, e]) => e);
    if (bad.length) { setErr(`Line ${bad[0][0]}: ${bad[0][1]} (${bad.length} line(s) with problems; nothing imported)`); return; }
    const outside = parsed.filter(l => l.txnDate < s.periodStart || l.txnDate > s.periodEnd).length;
    if (outside) { setErr(`${outside} line(s) fall outside the statement period; nothing imported.`); return; }
    await run('import', () => addStatementLines(s, parsed), `Imported ${parsed.length} line(s)`);
  };

  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="2xl" title={`Statement ${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}`}
      description={`Opening ${formatCurrency(s.openingBalance, currency)} · closing ${formatCurrency(s.closingBalance, currency)} · ${s.status}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[['Statement lines', String(lines.length)], ['Not matched', String(unmatched)], ['Difference', diff.toFixed(3)], ['Ledger items not on statement', String(uncleared.length)]].map(([k, v]) => (
            <div key={k} className="p-3 rounded-xl border border-slate-700"><p className="text-slate-400">{k}</p><p className={`font-bold ${k === 'Difference' && diff !== 0 ? 'text-rose-500' : 'text-slate-100'}`}>{v}</p></div>
          ))}
        </div>
        {err && <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="outline" size="sm" leftIcon={<Wand2 className="w-4 h-4" />} isLoading={busy === 'auto'} disabled={!!busy} onClick={() => void run('auto', () => autoMatchStatement(s.id), 'Auto-matched')}>Auto-match</Button>}
          {canAdd && <Button variant="outline" size="sm" leftIcon={<Upload className="w-4 h-4" />} disabled={!!busy} onClick={() => fileRef.current?.click()}>Import CSV</Button>}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} />
          {canAdd && <Button variant="ghost" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => {
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['date,description,reference,amount\n'], { type: 'text/csv' })); a.download = 'bank_statement_template.csv'; a.click(); URL.revokeObjectURL(a.href);
          }}>Template</Button>}
          {!locked && hasPermission('create', 'accounting', s.companyId) && <Button variant="ghost" size="sm" onClick={() => { onClose(); setCurrentPage('accounting'); }}>Book a missing item (journal)</Button>}
          {!locked && hasPermission('approve', 'reconciliation', s.companyId) && (
            <Button variant="success" size="sm" leftIcon={<CheckCircle2 className="w-4 h-4" />} isLoading={busy === 'done'} disabled={!!busy || unmatched > 0 || diff !== 0}
              onClick={() => void run('done', () => completeReconciliation(s.id), 'Statement reconciled').then(ok => { if (ok) void onChanged(); })}>Complete reconciliation</Button>
          )}
          {!locked && hasPermission('delete', 'reconciliation', s.companyId) && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-4 h-4" />} disabled={!!busy}
              onClick={() => { if (window.confirm('Delete this statement and its lines?')) void run('del', () => deleteBankStatement(s.id)).then(ok => { if (ok) { void onChanged(); onClose(); } }); }}>Delete</Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Date</th><th className={thCls}>Description</th><th className={`${thCls} text-right`}>Amount</th><th className={thCls}>Ledger match</th><th className={thCls} /></tr></thead>
            <tbody>
              {lines.length === 0 && <tr><td className={tdCls} colSpan={5}>No lines. Add them below or import a CSV.</td></tr>}
              {lines.map(l => { const m = l.journalLineId ? bookById.get(l.journalLineId) : undefined; return (
                <tr key={l.id}>
                  <td className={tdCls}>{formatDate(l.txnDate)}</td>
                  <td className={tdCls}>{l.description}{l.reference ? <span className="text-slate-400"> · {l.reference}</span> : null}</td>
                  <td className={`${tdCls} text-right font-mono ${l.amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{l.amount.toFixed(3)}</td>
                  <td className={tdCls}>{l.journalLineId ? <span className="text-xs">{m ? `${m.entryNumber} · ${formatDate(m.entryDate)}` : 'Matched (outside period)'}</span> : <Badge variant="amber">Not matched</Badge>}</td>
                  <td className={`${tdCls} text-right`}>
                    {canEdit && (l.journalLineId
                      ? <Button variant="ghost" size="xs" leftIcon={<Unlink className="w-3 h-3" />} onClick={() => void run(l.id, () => matchStatementLine(l.id, null))}>Unmatch</Button>
                      : <Button variant="ghost" size="xs" leftIcon={<Link2 className="w-3 h-3" />} onClick={() => setPicking(l)}>Match</Button>)}
                    {canEdit && !l.journalLineId && hasPermission('delete', 'reconciliation', s.companyId) && <Button variant="ghost" size="xs" onClick={() => void run(l.id, () => deleteStatementLine(l.id))}>Delete</Button>}
                  </td>
                </tr>
              ); })}
              {canAdd && (
                <tr>
                  <td className={tdCls}><input type="date" aria-label="Line date" className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-xs" value={newLine.txnDate} min={s.periodStart} max={s.periodEnd} onChange={e => setNewLine({ ...newLine, txnDate: e.target.value })} /></td>
                  <td className={tdCls}><input aria-label="Line description" placeholder="Description" className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full" value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })} /></td>
                  <td className={tdCls}><input type="number" step="0.001" aria-label="Line amount" className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-xs w-28 text-right" value={newLine.amount} onChange={e => setNewLine({ ...newLine, amount: Number(e.target.value) })} /></td>
                  <td className={tdCls}><span className="text-[11px] text-slate-400">Money out is negative</span></td>
                  <td className={`${tdCls} text-right`}><Button size="xs" leftIcon={<Plus className="w-3 h-3" />} disabled={!!busy || !!validateStatementLine(newLine)}
                    onClick={() => void run('add', () => addStatementLines(s, [newLine])).then(ok => ok && setNewLine({ ...newLine, description: '', reference: '', amount: 0 }))}>Add</Button></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {uncleared.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-300 mb-1"><Landmark className="w-3 h-3 inline" /> In the ledger but not on any statement (uncleared)</p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 divide-y divide-slate-700/60">
              {uncleared.map(b => <div key={b.journalLineId} className="px-3 py-1.5 text-xs flex justify-between"><span>{formatDate(b.entryDate)} · {b.entryNumber} · {b.description}</span><span className="font-mono">{b.amount.toFixed(3)}</span></div>)}
            </div>
          </div>
        )}
      </div>
      {picking && (
        <Modal isOpen onClose={() => setPicking(null)} size="md" title="Match to a ledger line" description={`${picking.description}: ${picking.amount.toFixed(3)}. Only unmatched ledger lines with the same amount are listed.`}>
          <div className="space-y-2">
            {uncleared.filter(b => Math.abs(b.amount - picking.amount) < 0.0005).length === 0 && <p className="text-xs text-slate-400">No unmatched ledger line has this amount. Book the item as a journal on this bank account first.</p>}
            {uncleared.filter(b => Math.abs(b.amount - picking.amount) < 0.0005).map(b => (
              <button key={b.journalLineId} type="button" className="w-full text-left px-3 py-2 rounded-xl border border-slate-700 hover:border-forest-500 text-xs"
                onClick={() => void run('match', () => matchStatementLine(picking.id, b.journalLineId)).then(ok => ok && setPicking(null))}>
                {formatDate(b.entryDate)} · {b.entryNumber} · {b.description} · <b>{b.amount.toFixed(3)}</b>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Modal>
  );
};
