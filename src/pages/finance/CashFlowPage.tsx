// Finance → Cash flow statement (direct method), computed in the database from posted journals on
// the office's bank accounts. Movements are classed by the other side of each entry: fixed assets →
// investing; equity and long-term loans → financing; everything else → operating.
import React, { useCallback, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import { CashFlowRow, fetchCashFlow } from '../../services/ledger';
import { downloadCsv } from '../../utils/export';
import { PageHeader } from '../../components/ui/PageHeader';

const SECTIONS = [['Operating', 'Operating activities'], ['Investing', 'Investing activities'], ['Financing', 'Financing activities']] as const;

export const CashFlowPage: React.FC = () => {
  const { companies, selectedCompanyId, currency } = useFleet();
  const { hasPermission } = useAuth();
  const offices = companies.filter(c => hasPermission('view', 'financial-statements', c.id));
  const [officeId, setOfficeId] = useState('');
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(localToday());
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!offices.some(o => o.id === officeId)) setOfficeId(offices.some(o => o.id === selectedCompanyId) ? selectedCompanyId : offices[0]?.id ?? '');
  }, [offices, officeId, selectedCompanyId]);
  const load = useCallback(async () => {
    if (!officeId || !from || !to || to < from) return;
    setLoading(true); setErr(null);
    try { setRows(await fetchCashFlow(officeId, from, to)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [officeId, from, to]);
  useEffect(() => { void load(); }, [load]);

  const office = offices.find(o => o.id === officeId);
  const amt = (n: number) => <span className={`font-mono ${n < 0 ? 'text-rose-500' : ''}`}>{formatCurrency(n, currency)}</span>;
  const opening = rows.find(r => r.section === 'Opening')?.amount ?? 0;
  const closing = rows.find(r => r.section === 'Closing')?.amount ?? 0;
  const net = (sec: string) => rows.filter(r => r.section === sec).reduce((t, r) => t + r.amount, 0);

  const exportCsv = () => downloadCsv(`Cash_flow_${office?.code ?? ''}_${from}_${to}`, ['section', 'line', 'amount'],
    rows.map(r => [r.section, r.line, r.amount]), { dated: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash flow statement"
        description="Money in and out of the office's bank and cash accounts, from posted journals."
        actions={
          <>
            <Button variant="outline" size="md" leftIcon={<Download className="w-4 h-4" />} onClick={exportCsv} disabled={!rows.length || !hasPermission('export', 'financial-statements', officeId)}>CSV</Button>
            <Button variant="outline" size="md" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()} disabled={!rows.length}>Print / PDF</Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div className="w-56"><Select label="Office" value={officeId} onChange={e => setOfficeId(e.target.value)}>
          {offices.length === 0 && <option value="">No office available</option>}
          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select></div>
        <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} />
      </div>
      {to < from && <p className="text-xs text-rose-500">The end date is before the start date.</p>}
      {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4 sm:p-6 space-y-4 max-w-3xl">
        <p className="text-sm font-bold text-slate-100">{office?.name} · {formatDate(from)} to {formatDate(to)}</p>
        {loading && <p className="text-xs text-slate-400">Loading…</p>}
        <div className="flex justify-between text-sm"><span className="text-slate-300">Cash at start of period</span>{amt(opening)}</div>
        {SECTIONS.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">{label}</p>
            {rows.filter(r => r.section === key).map(r => <div key={r.line} className="flex justify-between text-sm pl-3"><span className="text-slate-300">{r.line}</span>{amt(r.amount)}</div>)}
            {rows.filter(r => r.section === key).length === 0 && <p className="text-xs text-slate-500 pl-3">No movements</p>}
            <div className="flex justify-between text-sm font-bold border-t border-slate-700 pt-1"><span>Net cash from {label.toLowerCase()}</span>{amt(net(key))}</div>
          </div>
        ))}
        <div className="flex justify-between text-sm font-bold border-t-2 border-slate-600 pt-2"><span>Cash at end of period</span>{amt(closing)}</div>
        <p className="text-[11px] text-slate-500">Cash means the GL accounts linked to this office's bank accounts. Transfers between those accounts are left out.</p>
      </div>
    </div>
  );
};
