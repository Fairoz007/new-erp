// Role dashboards: executive, finance, HR and sponsor. The fleet dashboard is the original
// DashboardPage body. Every figure comes from data the user may see (RLS); nothing is estimated.
// Ledger and invoice figures are aggregated in the database (ledger_movements, invoice_summary,
// dashboard_open_invoices); only the few rows a panel lists are fetched.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { addDaysYmd, formatDate, localToday } from '../../utils/date';
import { balanceSheetFrom, movementsFromRows } from '../../services/accounting';
import { useInvoiceSummary, useLedgerMovementRows, useProfitLossByOffice } from '../../services/queries';
import { useBudgetAlerts, useDashboardOpenInvoices, usePendingExpenseCount, useProfitLossTrend } from '../../services/queries-dashboards';
import { fetchLeaveRequests, type LeaveRequest } from '../../services/hrops';
import { usePendingJournals } from '../approvals/JournalQueue';
import { tableCls, tdCls, thCls } from '../setup/shared';

const yearStart = () => `${new Date().getFullYear()}-01-01`;
const monthStart = (offset = 0) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const monthEnd = (offset = 0) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monthLabel = (offset = 0) => new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1).toLocaleString('en', { month: 'short', year: '2-digit' });

const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <Card className="bg-white">
    <CardHeader className="py-4 px-5"><CardTitle className="text-sm font-bold text-slate-100">{title}</CardTitle>{note && <p className="text-xs text-slate-400">{note}</p>}</CardHeader>
    <div className="px-5 pb-4 overflow-x-auto">{children}</div>
  </Card>
);

function useOffices(module: string) {
  const { companies, selectedCompanyId } = useFleet();
  const { hasPermission } = useAuth();
  return companies.filter(c => (selectedCompanyId === 'all' || c.id === selectedCompanyId) && hasPermission('view', module, c.id));
}

/** Revenue, expenses and net profit per office for a date range, from posted journals (one ledger_movements call). */
function usePnlByOffice(officeIds: string[], from: string, to: string) {
  const { chartOfAccounts } = useFleet();
  const q = useProfitLossByOffice(chartOfAccounts, officeIds, { startDate: from, endDate: to }, { enabled: officeIds.length > 0 });
  const rows = useMemo(() => officeIds.map(id => {
    const p = q.data?.get(id);
    return { id, revenue: p?.totalRevenue ?? 0, expenses: p ? Math.round((p.totalDirectCosts + p.totalOperatingExpenses + p.depreciationExpense) * 1000) / 1000 : 0, net: p?.netProfit ?? 0 };
  }), [q.data, officeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows, loading: q.loading && officeIds.length > 0, error: q.error, refetch: q.refetch };
}

/** Loading or error line for a dashboard whose figures come from the server. */
const LoadState: React.FC<{ loading?: boolean; error?: Error; onRetry?: () => void }> = ({ loading, error, onRetry }) => {
  if (error) return (
    <p role="alert" className="text-xs text-rose-500">
      Some figures could not be loaded: {error.message}{' '}
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>}
    </p>
  );
  if (loading) return <p aria-busy="true" className="text-xs text-slate-400">Loading figures…</p>;
  return null;
};

// ---------------------------------------------------------------- executive
export const ExecutiveDashboard: React.FC = () => {
  const { vehicles, employees, bankAccounts, currency } = useFleet();
  const offices = useOffices('financial-statements');
  const pnl = usePnlByOffice(offices.map(o => o.id), yearStart(), localToday());
  // approved invoices with an open balance, per office (invoice_summary.by_office)
  const summary = useInvoiceSummary(null);
  const rows = offices.map(o => {
    const p = pnl.rows.find(x => x.id === o.id)!;
    const inv = summary.data?.by_office.find(b => b.company_id === o.id);
    return { o, ...p, vehicles: vehicles.filter(v => v.companyId === o.id).length, active: vehicles.filter(v => v.companyId === o.id && v.status === 'Active').length,
      staff: employees.filter(e => e.companyId === o.id && e.status !== 'Terminated').length, ar: inv?.ar_open ?? 0, ap: inv?.ap_open ?? 0,
      cash: bankAccounts.filter(b => b.companyId === o.id).reduce((s, b) => s + b.currentBalance, 0) };
  });
  const sum = (k: 'revenue' | 'expenses' | 'net' | 'cash' | 'ar' | 'ap') => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="space-y-6">
      <LoadState loading={pnl.loading || summary.loading} error={pnl.error ?? summary.error} onRetry={() => { void pnl.refetch(); void summary.refetch(); }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Revenue YTD" value={formatCurrency(sum('revenue'), currency)} isHero subValue={`${offices.length} office(s)`} />
        <StatCard title="Net profit YTD" value={formatCurrency(sum('net'), currency)} subValue={`Expenses ${formatCurrency(sum('expenses'), currency)}`} />
        <StatCard title="Cash in bank" value={formatCurrency(sum('cash'), currency)} subValue="Bank and cash accounts" />
        <StatCard title="Receivable − payable" value={formatCurrency(sum('ar') - sum('ap'), currency)} subValue={`AR ${formatCurrency(sum('ar'), currency)} · AP ${formatCurrency(sum('ap'), currency)}`} />
      </div>
      <Panel title="Offices at a glance" note="Year to date, from posted journals; fleet and staff as of today.">
        <table className={tableCls}>
          <thead><tr><th className={thCls}>Office</th><th className={`${thCls} text-right`}>Revenue</th><th className={`${thCls} text-right`}>Expenses</th><th className={`${thCls} text-right`}>Net</th><th className={`${thCls} text-right`}>Cash</th><th className={`${thCls} text-right`}>Vehicles</th><th className={`${thCls} text-right`}>Staff</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className={tdCls} colSpan={7}>No offices to show.</td></tr>}
            {rows.map(r => (
              <tr key={r.o.id}>
                <td className={tdCls}>{r.o.name}</td>
                <td className={`${tdCls} text-right font-mono`}>{formatCurrency(r.revenue, currency)}</td>
                <td className={`${tdCls} text-right font-mono`}>{formatCurrency(r.expenses, currency)}</td>
                <td className={`${tdCls} text-right font-mono font-bold ${r.net < 0 ? 'text-rose-500' : ''}`}>{formatCurrency(r.net, currency)}</td>
                <td className={`${tdCls} text-right font-mono`}>{formatCurrency(r.cash, currency)}</td>
                <td className={`${tdCls} text-right`}>{r.active}/{r.vehicles}</td>
                <td className={`${tdCls} text-right`}>{r.staff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
};

// ---------------------------------------------------------------- finance
export const FinanceDashboard: React.FC = () => {
  const { bankAccounts, currency, selectedCompanyId } = useFleet();
  const { setCurrentPage, openInvoiceModal } = useUI();
  const journals = usePendingJournals();
  const offices = useOffices('accounting');
  const ids = new Set(offices.map(o => o.id));
  const inScope = (c: string) => ids.has(c);
  // Open approved invoices (not credit notes) per office, from invoice_summary.by_office
  const summary = useInvoiceSummary(null);
  const officeRows = (summary.data?.by_office ?? []).filter(b => inScope(b.company_id));
  const total = (k: 'ar_open' | 'ap_open' | 'ap_open_count' | 'ar_overdue_count' | 'ar_overdue_sum' | 'pending_approval') => officeRows.reduce((s, b) => s + b[k], 0);
  const arTotal = total('ar_open'); const apTotal = total('ap_open'); const apCount = total('ap_open_count');
  const overdueCount = total('ar_overdue_count'); const overdueSum = total('ar_overdue_sum');
  // the 8 oldest overdue receivables in these offices
  const overdue = useDashboardOpenInvoices('overdue_receivables', [...ids], 8);
  const banks = bankAccounts.filter(b => inScope(b.companyId));
  const pendInv = total('pending_approval');
  const pendExpQ = usePendingExpenseCount([...ids]);
  const pendExp = pendExpQ.data ?? 0;
  const pendJr = journals.rows.filter(r => inScope(r.companyId)).length;
  const pnl = usePnlByOffice([...ids], monthStart(), localToday());
  const month = pnl.rows.reduce((s, p) => ({ revenue: s.revenue + p.revenue, net: s.net + p.net }), { revenue: 0, net: 0 });
  const alertsQ = useBudgetAlerts(selectedCompanyId, 5);
  const budgetAlerts = alertsQ.data ?? [];
  const firstError = summary.error ?? overdue.error ?? pendExpQ.error ?? pnl.error ?? alertsQ.error;
  return (
    <div className="space-y-6">
      <LoadState loading={summary.loading || pnl.loading} error={firstError}
        onRetry={() => { void summary.refetch(); void overdue.refetch(); void pendExpQ.refetch(); void pnl.refetch(); void alertsQ.refetch(); }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Cash in bank" value={formatCurrency(banks.reduce((s, b) => s + b.currentBalance, 0), currency)} isHero subValue={`${banks.length} account(s)`} />
        <StatCard title="Receivables" value={formatCurrency(arTotal, currency)} subValue={`${overdueCount} overdue · ${formatCurrency(overdueSum, currency)}`} onClick={() => setCurrentPage('invoices')} />
        <StatCard title="Payables" value={formatCurrency(apTotal, currency)} subValue={`${apCount} open bill(s)`} onClick={() => setCurrentPage('invoices')} />
        <StatCard title="Waiting for approval" value={pendInv + pendExp + pendJr} subValue={`${pendInv} invoices · ${pendExp} expenses · ${pendJr} journals`} onClick={() => setCurrentPage('approvals')} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Bank and cash balances" note={`This month: revenue ${formatCurrency(month.revenue, currency)}, net ${formatCurrency(month.net, currency)}`}>
          <table className={tableCls}><tbody>
            {banks.length === 0 && <tr><td className={tdCls}>No bank accounts.</td></tr>}
            {banks.map(b => <tr key={b.id}><td className={tdCls}>{b.bankName} · {b.accountName}</td><td className={`${tdCls} text-right font-mono`}>{formatCurrency(b.currentBalance, currency)}</td></tr>)}
          </tbody></table>
        </Panel>
        <Panel title="Overdue receivables" note="Oldest due date first">
          <table className={tableCls}><tbody>
            {overdue.loading && <tr><td className={tdCls}>Loading…</td></tr>}
            {!overdue.loading && (overdue.data ?? []).length === 0 && <tr><td className={tdCls}>Nothing overdue.</td></tr>}
            {(overdue.data ?? []).map(i => (
              <tr key={i.id} className="cursor-pointer hover:bg-slate-850" onClick={() => openInvoiceModal(i.id)}>
                <td className={tdCls}><p className="font-semibold">{i.invoiceNumber}</p><p className="text-[11px] text-slate-400">{i.partyName}</p></td>
                <td className={tdCls}>due {formatDate(i.dueDate)}</td>
                <td className={`${tdCls} text-right font-mono`}>{formatCurrency(i.outstandingAmount, currency)}</td>
              </tr>
            ))}
          </tbody></table>
        </Panel>
      </div>
      {budgetAlerts.length > 0 && (
        <Panel title="Budget alerts">
          <ul className="space-y-1 text-xs">{budgetAlerts.map(n => <li key={n.id} className="flex gap-2"><Badge variant={n.severity === 'critical' ? 'rose' : 'amber'}>{n.severity === 'critical' ? '100%' : '80%'}</Badge>{n.message}</li>)}</ul>
        </Panel>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- HR
export const HrDashboard: React.FC = () => {
  const { employees, payrollRuns, companies, currency } = useFleet();
  const { hasPermission } = useAuth();
  const offices = useOffices('hr');
  const ids = new Set(offices.map(o => o.id));
  const staff = employees.filter(e => ids.has(e.companyId) && e.status !== 'Terminated');
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  useEffect(() => { if (hasPermission('view', 'leave')) fetchLeaveRequests(new Date().getFullYear()).then(setLeave).catch(() => setLeave([])); }, [hasPermission]);
  const today = localToday();
  const in30 = addDaysYmd(30);
  const onLeave = leave.filter(l => ids.has(l.companyId) && l.status === 'Approved' && l.startDate <= today && l.endDate >= today).length;
  const pending = leave.filter(l => ids.has(l.companyId) && l.status === 'Pending').length;
  const papers = staff.flatMap(e => ([['Civil ID', e.civilIdExpiryDate], ['Passport', e.passportExpiryDate], ['Visa', e.visaExpiryDate], ['Labour card', e.labourCardExpiryDate]] as const)
    .filter(([, d]) => d && d <= in30).map(([k, d]) => ({ id: `${e.id}${k}`, name: e.name, item: k, due: d as string }))).sort((a, b) => a.due.localeCompare(b.due));
  const byDept = Object.entries(staff.reduce<Record<string, number>>((m, e) => { m[e.department || 'Unassigned'] = (m[e.department || 'Unassigned'] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const latestRuns = offices.map(o => payrollRuns.filter(r => r.companyId === o.id).sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month))[0]).filter(Boolean);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Headcount" value={staff.length} isHero subValue={`${offices.length} office(s)`} />
        <StatCard title="On leave today" value={onLeave} subValue={`${pending} request(s) waiting`} />
        <StatCard title="Papers expiring" value={papers.length} subValue="Expired or within 30 days" />
        <StatCard title="Monthly basic payroll" value={formatCurrency(staff.reduce((s, e) => s + (e.basicSalary || 0), 0), currency)} subValue="Active staff, before allowances" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Staff by department">
          <table className={tableCls}><tbody>{byDept.length === 0 ? <tr><td className={tdCls}>No staff.</td></tr> : byDept.map(([d, n]) => <tr key={d}><td className={tdCls}>{d}</td><td className={`${tdCls} text-right`}>{n}</td></tr>)}</tbody></table>
        </Panel>
        <Panel title="Papers to renew">
          <table className={tableCls}><tbody>{papers.length === 0 ? <tr><td className={tdCls}>Nothing due.</td></tr> : papers.slice(0, 8).map(p => (
            <tr key={p.id}><td className={tdCls}>{p.name}</td><td className={tdCls}>{p.item}</td><td className={`${tdCls} ${p.due < today ? 'text-rose-500 font-bold' : ''}`}>{formatDate(p.due)}</td></tr>
          ))}</tbody></table>
        </Panel>
        <Panel title="Latest payroll per office">
          <table className={tableCls}><tbody>{latestRuns.length === 0 ? <tr><td className={tdCls}>No payroll yet.</td></tr> : latestRuns.map(r => (
            <tr key={r!.id}><td className={tdCls}>{companies.find(c => c.id === r!.companyId)?.code} · {r!.periodLabel}</td><td className={tdCls}><Badge variant={r!.status === 'Paid' ? 'emerald' : 'amber'}>{r!.status}</Badge></td><td className={`${tdCls} text-right font-mono`}>{formatCurrency(r!.totalNetPayout, currency)}</td></tr>
          ))}</tbody></table>
        </Panel>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- sponsor (statements only)
export const SponsorDashboard: React.FC = () => {
  const { chartOfAccounts, currency } = useFleet();
  const offices = useOffices('financial-statements');
  const ids = offices.map(o => o.id);
  const ytd = usePnlByOffice(ids, yearStart(), localToday());
  const months = [-5, -4, -3, -2, -1, 0];
  const ranges = months.map(m => ({ startDate: monthStart(m), endDate: monthEnd(m) }));
  const trendQ = useProfitLossTrend(chartOfAccounts, ids, ranges);
  const trend = months.map((m, i) => ({ label: monthLabel(m), revenue: trendQ.data?.[i].revenue ?? 0, net: trendQ.data?.[i].net ?? 0 }));
  // balance sheet per office today: movements up to today (ledger_movements), one call for all offices
  const today = localToday();
  const bsQ = useLedgerMovementRows(null, undefined, today, { enabled: ids.length > 0 });
  const sheets = useMemo(() => ids.map(id => ({ id, bs: balanceSheetFrom(chartOfAccounts, movementsFromRows(bsQ.data ?? [], id), id, today) })), [chartOfAccounts, bsQ.data, ids.join(','), today]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (k: 'revenue' | 'expenses' | 'net') => ytd.rows.reduce((s, r) => s + r[k], 0);
  const max = Math.max(1, ...trend.map(t => Math.abs(t.revenue)));
  return (
    <div className="space-y-6">
      <LoadState loading={ytd.loading || trendQ.loading || (bsQ.loading && ids.length > 0)} error={ytd.error ?? trendQ.error ?? bsQ.error}
        onRetry={() => { void ytd.refetch(); void trendQ.refetch(); void bsQ.refetch(); }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Revenue YTD" value={formatCurrency(total('revenue'), currency)} isHero subValue={`${offices.length} sponsored office(s)`} />
        <StatCard title="Expenses YTD" value={formatCurrency(total('expenses'), currency)} />
        <StatCard title="Net profit YTD" value={formatCurrency(total('net'), currency)} />
        <StatCard title="Equity" value={formatCurrency(sheets.reduce((s, x) => s + x.bs.equity.totalEquity, 0), currency)} subValue="Assets minus liabilities, today" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Revenue and net profit, last 6 months">
          <div className="space-y-2">
            {trend.map(t => (
              <div key={t.label} className="text-xs">
                <div className="flex justify-between"><span className="text-slate-300">{t.label}</span><span className="font-mono text-slate-200">{formatCurrency(t.revenue, currency)} · net {formatCurrency(t.net, currency)}</span></div>
                <div className="h-1.5 rounded-full bg-slate-850 overflow-hidden"><div className="h-full bg-[#086343]" style={{ width: `${Math.max(1, (Math.abs(t.revenue) / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Per office" note="Year to date and balance sheet today">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Office</th><th className={`${thCls} text-right`}>Net profit</th><th className={`${thCls} text-right`}>Assets</th><th className={`${thCls} text-right`}>Liabilities</th></tr></thead>
            <tbody>{offices.map(o => { const p = ytd.rows.find(x => x.id === o.id)!; const bs = sheets.find(x => x.id === o.id)!.bs; return (
              <tr key={o.id}><td className={tdCls}>{o.name}</td><td className={`${tdCls} text-right font-mono`}>{formatCurrency(p.net, currency)}</td><td className={`${tdCls} text-right font-mono`}>{formatCurrency(bs.assets.totalAssets, currency)}</td><td className={`${tdCls} text-right font-mono`}>{formatCurrency(bs.liabilities.totalLiabilities, currency)}</td></tr>
            ); })}</tbody>
          </table>
        </Panel>
      </div>
      <p className="text-[11px] text-slate-400">Read-only figures from posted journals. Full statements are under Trial Balance, Profit & Loss, Balance Sheet and Cash Flow.</p>
    </div>
  );
};

/** Which dashboards the user gets, in order; the first is the default. */
export function useDashboardTabs() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const ledger = hasPermission('view', 'accounting');
  const statements = hasPermission('view', 'financial-statements');
  const tabs: { id: string; label: string }[] = [];
  if (isSuperAdmin || (statements && ledger && hasPermission('view', 'vehicles'))) tabs.push({ id: 'executive', label: 'Executive' });
  if (ledger) tabs.push({ id: 'finance', label: 'Finance' });
  if (hasPermission('view', 'vehicles')) tabs.push({ id: 'fleet', label: 'Fleet' });
  if (hasPermission('view', 'hr')) tabs.push({ id: 'hr', label: 'HR' });
  if (statements && !ledger) tabs.push({ id: 'sponsor', label: 'Owner view' });
  return tabs;
}

