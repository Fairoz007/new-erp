// Reports added in Phase 10: fleet utilization, expiries, client / supplier statements, payroll
// summary, expense by category, budget vs actual, P&L per office and consolidated P&L. Every one
// takes the page's office and date filters and is computed from live data the user may see (RLS).
import React, { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { useExpenseTotals, useProfitLoss, useProfitLossByOffice } from '../../services/queries';
import { usePartyStatement } from '../../services/queries-reports';
import { fetchBudgetVsActual, type BudgetActual } from '../../services/ledger';
import { fetchFleetExpiries, EXPIRY_LABEL, type FleetExpiry } from '../../services/drivers';
import { Row, text, mono, date, money, int, EmptyReport, ReportTable } from './reportKit';
import { todayYmd } from '../../utils/date';

export interface ReportFilters { office: string; from: string; to: string }
export interface ExtraReport { id: string; name: string; desc: string; group: string; render: React.FC<ReportFilters> }

const inRange = (d: string | undefined, f: ReportFilters) => !!d && (!f.from || d >= f.from) && (!f.to || d <= f.to);
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-xs text-slate-400">{children}</p>;
const Loading = () => <Card className="p-6 rounded-[20px] bg-white border border-slate-700 shadow-card"><p className="text-xs text-slate-400">Loading…</p></Card>;
const Failed: React.FC<{ error: string; onRetry?: () => void }> = ({ error, onRetry }) => (
  <Card className="p-6 rounded-[20px] bg-white border border-rose-200 shadow-card">
    <p className="text-sm font-semibold text-rose-600">Could not load the report</p><p className="text-xs text-slate-400 mt-1">{error}</p>
    {onRetry && <button type="button" className="mt-3 text-xs font-semibold text-forest-600 hover:underline" onClick={onRetry}>Retry</button>}
  </Card>
);

// ---------------------------------------------------------------- fleet utilization
const FleetUtilization: React.FC<ReportFilters> = f => {
  const { vehicles, oilChanges, maintenanceRecords, accidents, currency } = useFleet();
  void currency;
  const days = f.from && f.to ? daysBetween(f.from, f.to) : 0;
  const rows = vehicles.filter(v => f.office === 'all' || v.companyId === f.office).map(v => {
    const readings = [
      ...oilChanges.filter(o => o.vehicleId === v.id && inRange(o.date, f)).map(o => o.odometer),
      ...maintenanceRecords.filter(m => m.vehicleId === v.id && inRange(m.maintenanceDate, f)).map(m => m.odometerReading ?? 0),
    ].filter(n => n > 0);
    const km = readings.length >= 2 ? Math.max(...readings) - Math.min(...readings) : null;
    const downtime = Math.min(days, accidents.filter(a => a.vehicleId === v.id && inRange(a.accidentDate, f)).reduce((s, a) => s + (a.vehicleDowntimeDays || 0), 0));
    const services = maintenanceRecords.filter(m => m.vehicleId === v.id && inRange(m.maintenanceDate, f)).length;
    return {
      id: v.id, plate: v.plateNumber, vehicle: `${v.brand} ${v.model}`, type: v.vehicleType, status: v.status, km, services, downtime,
      availability: days > 0 ? Math.round(((days - downtime) / days) * 1000) / 10 : null,
    };
  });
  return (
    <div className="space-y-2">
      <Note>Kilometres = highest minus lowest odometer reading recorded in the period (oil changes and maintenance; needs two readings). Availability = days in the period not lost to accident downtime. Trips are not recorded, so this is not a trip-based utilization.</Note>
      <ReportTable rows={rows} filename="Fleet_Utilization_Report" columns={[
        mono('plate', 'Plate'), text('vehicle', 'Vehicle'), text('type', 'Type'), text('status', 'Status now'), int('km', 'KM in period', ' KM'),
        int('services', 'Services'), int('downtime', 'Downtime (days)'), int('availability', 'Availability', '%'),
      ]} />
    </div>
  );
};

// ---------------------------------------------------------------- expiries
const ExpiryReport: React.FC<ReportFilters> = f => {
  const { employees, documents, vehicles, companies } = useFleet();
  const [fleet, setFleet] = useState<FleetExpiry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetchFleetExpiries(f.to || '9999-12-31').then(setFleet).catch(e => setErr((e as Error).message)); }, [f.to]);
  if (err) return <Failed error={err} />;
  if (!fleet) return <Loading />;
  const office = (id?: string) => companies.find(c => c.id === id)?.code ?? '';
  const today = todayYmd();
  const ok = (companyId: string | undefined, due?: string) => !!due && (f.office === 'all' || companyId === f.office) && due <= (f.to || '9999-12-31') && (due >= (f.from || '0000') || due < today);
  const rows: Row[] = [
    ...fleet.filter(x => ok(x.companyId, x.dueDate)).map((x, i) => ({ id: `f${i}`, office: office(x.companyId), item: EXPIRY_LABEL[x.kind], subject: x.label || vehicles.find(v => v.id === x.vehicleId)?.plateNumber || '', due: x.dueDate })),
    ...employees.flatMap(e => ([['Civil ID', e.civilIdExpiryDate], ['Passport', e.passportExpiryDate], ['Visa', e.visaExpiryDate], ['Labour card', e.labourCardExpiryDate]] as const)
      .filter(([, d]) => e.status !== 'Terminated' && ok(e.companyId, d)).map(([k, d]) => ({ id: `e${e.id}${k}`, office: office(e.companyId), item: k, subject: e.name, due: d }))),
    ...documents.filter(d => ok(d.companyId, d.expiryDate)).map(d => ({ id: `d${d.id}`, office: office(d.companyId), item: d.category, subject: d.documentName, due: d.expiryDate })),
  ].map(r => ({ ...r, due: String(r.due), state: String(r.due) < today ? 'Expired' : 'Expiring' })).sort((a, b) => a.due.localeCompare(b.due));
  return (
    <div className="space-y-2">
      <Note>Everything already expired, plus everything expiring between the start and end dates: vehicle registration, insurance, permits, inspections, driving licences, employee papers and documents with an expiry date.</Note>
      <ReportTable rows={rows} filename="Expiry_Report" columns={[text('office', 'Office'), text('item', 'Item'), text('subject', 'Vehicle / person / document'), date('due', 'Expiry'), text('state', 'State')]} />
    </div>
  );
};

// ---------------------------------------------------------------- client / supplier statement
const PartyStatement: React.FC<ReportFilters & { kind: 'Customer' | 'Supplier' }> = ({ kind, ...f }) => {
  const { customers, suppliers, currency } = useFleet();
  const parties = (kind === 'Customer' ? customers : suppliers).slice().sort((a, b) => a.name.localeCompare(b.name));
  const [partyId, setPartyId] = useState('');
  useEffect(() => { if (!parties.some(p => p.id === partyId)) setPartyId(parties[0]?.id ?? ''); }, [parties, partyId]);
  // Approved invoices, credit / debit notes and payments with opening and running balance, from the database
  const q = usePartyStatement({ partyId, kind, companyId: f.office, from: f.from, to: f.to, style: 'statement' });
  const rows = useMemo(() => (q.data?.lines ?? []).map(l => ({
    id: l.line_id, date: l.date, ref: l.reference,
    detail: l.kind === 'Payment' ? `Payment · ${l.invoice_number ?? ''}` : l.kind === 'Credit Note' ? 'Credit note' : l.kind === 'Debit Note' ? 'Debit note' : 'Invoice',
    charge: l.charge, credit: l.credit, balance: l.running_balance,
  })), [q.data]);
  if (parties.length === 0) return <EmptyReport message={`No ${kind === 'Customer' ? 'clients' : 'suppliers'} you can see.`} />;
  const picker = (
    <div className="w-full sm:w-72"><Select label={kind === 'Customer' ? 'Client' : 'Supplier'} value={partyId} onChange={e => setPartyId(e.target.value)}>
      {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select></div>
  );
  if (q.error) return <div className="space-y-3">{picker}<Failed error={q.error.message} onRetry={() => { void q.refetch(); }} /></div>;
  if (!q.data) return <div className="space-y-3">{picker}<Loading /></div>;
  const opening = q.data.opening_balance;
  const closing = q.data.closing_balance;
  return (
    <div className="space-y-3">
      {picker}
      <Note>Approved invoices, credit and debit notes, and payments. Opening balance before {f.from || 'the start'}: <strong className="text-slate-200">{formatCurrency(opening, currency)}</strong>. Closing balance: <strong className="text-slate-200">{formatCurrency(closing, currency)}</strong> ({kind === 'Customer' ? 'owed by the client' : 'owed to the supplier'}).</Note>
      <ReportTable rows={rows} filename={`${kind === 'Customer' ? 'Client' : 'Supplier'}_Statement`} title={`${kind === 'Customer' ? 'Client' : 'Supplier'} statement: ${parties.find(p => p.id === partyId)?.name ?? ''}`} columns={[
        date('date', 'Date'), mono('ref', 'Reference'), text('detail', 'Detail'), money('charge', kind === 'Customer' ? 'Charged' : 'Billed', currency), money('credit', kind === 'Customer' ? 'Received / credited' : 'Paid / credited', currency), money('balance', 'Balance', currency, true),
      ]} />
    </div>
  );
};

// ---------------------------------------------------------------- payroll summary
const PayrollSummary: React.FC<ReportFilters> = f => {
  const { payrollRuns, currency } = useFleet();
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  const rows = payrollRuns.filter(r => (f.office === 'all' || r.companyId === f.office)
      && (!f.from || key(r.year, r.month) >= f.from.slice(0, 7)) && (!f.to || key(r.year, r.month) <= f.to.slice(0, 7)))
    .sort((a, b) => key(b.year, b.month).localeCompare(key(a.year, a.month)) || a.companyName.localeCompare(b.companyName))
    .map(r => ({ id: r.id, period: r.periodLabel, office: r.companyName, number: r.payrollNumber, employees: r.totalEmployees, basic: r.totalBasicSalary,
      allowances: r.totalAllowances, gross: r.totalGrossPay, deductions: r.totalDeductions, net: r.totalNetPayout, employerPasi: r.totalEmployerPasi ?? 0, status: r.status }));
  return (
    <div className="space-y-2">
      <Note>Payroll runs whose month falls in the period. Draft and submitted runs are listed with their status; only approved runs are in the ledger.</Note>
      <ReportTable rows={rows} filename="Payroll_Summary" columns={[
        text('period', 'Month'), text('office', 'Office'), mono('number', 'Run'), int('employees', 'Staff'), money('basic', 'Basic', currency), money('allowances', 'Allowances', currency),
        money('gross', 'Gross', currency), money('deductions', 'Deductions', currency), money('net', 'Net pay', currency, true), money('employerPasi', 'Employer PASI', currency), text('status', 'Status'),
      ]} />
    </div>
  );
};

// ---------------------------------------------------------------- expense by category
const ExpenseByCategory: React.FC<ReportFilters> = f => {
  const { companies, currency } = useFleet();
  // Approved expenses per office and category, totalled in the database
  const q = useExpenseTotals({ company: f.office, from: f.from, to: f.to }, 'office_category');
  if (q.error) return <Failed error={q.error.message} onRetry={() => { void q.refetch(); }} />;
  if (!q.data) return <Loading />;
  const rows: Row[] = q.data.map(r => ({
    id: `${r.company_id}|${r.category}`, office: companies.find(c => c.id === r.company_id)?.name ?? '', category: r.category,
    count: r.count, net: r.net, vat: r.tax, total: r.total,
  })).sort((a, b) => b.total - a.total);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="space-y-2">
      <Note>Approved expenses in the period. Total: <strong className="text-slate-200">{formatCurrency(grand, currency)}</strong>. Payroll, maintenance bills and depreciation are in the P&L, not here.</Note>
      <ReportTable rows={rows.map(r => ({ ...r, share: grand > 0 ? Math.round((r.total / grand) * 1000) / 10 : 0 }))} filename="Expense_By_Category" columns={[
        text('office', 'Office'), text('category', 'Category'), int('count', 'Expenses'), money('net', 'Net', currency), money('vat', 'VAT', currency), money('total', 'Total', currency, true), int('share', 'Share', '%'),
      ]} />
    </div>
  );
};

// ---------------------------------------------------------------- budget vs actual
const BudgetVsActualReport: React.FC<ReportFilters> = f => {
  const { companies, currency } = useFleet();
  const year = Number((f.to || new Date().toISOString()).slice(0, 4));
  const upTo = f.to && f.to.slice(0, 4) === String(year) ? Number(f.to.slice(5, 7)) : 12;
  const offices = f.office === 'all' ? companies : companies.filter(c => c.id === f.office);
  const [data, setData] = useState<{ office: string; rows: BudgetActual[] }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ids = offices.map(o => o.id).join(',');
  useEffect(() => {
    let live = true; setData(null); setErr(null);
    Promise.all(offices.map(o => fetchBudgetVsActual(o.id, year).then(rows => ({ office: o.name, rows })).catch(() => ({ office: o.name, rows: [] as BudgetActual[] }))))
      .then(d => { if (live) setData(d); }).catch(e => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [ids, year]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Failed error={err} />;
  if (!data) return <Loading />;
  const rows = data.flatMap(d => {
    const by = new Map<string, Row>();
    for (const r of d.rows.filter(x => x.month <= upTo)) {
      const k = `${d.office}|${r.accountCode}`;
      const cur = by.get(k) ?? { id: k, office: d.office, account: `${r.accountCode} ${r.accountName}`, kind: r.category === 'Revenue' ? 'Income' : 'Expense', budget: 0, actual: 0 };
      cur.budget += r.budget; cur.actual += r.actual; by.set(k, cur);
    }
    return [...by.values()];
  }).map(r => ({ ...r, variance: r.kind === 'Expense' ? r.budget - r.actual : r.actual - r.budget, used: r.budget > 0 ? Math.round((r.actual / r.budget) * 1000) / 10 : null }));
  return (
    <div className="space-y-2">
      <Note>Approved budgets for {year}, January to month {upTo} (from the end date), against posted journals. A positive variance is favourable.</Note>
      <ReportTable rows={rows} filename={`Budget_vs_Actual_${year}`} columns={[
        text('office', 'Office'), text('account', 'Account'), text('kind', 'Type'), money('budget', 'Budget', currency), money('actual', 'Actual', currency), money('variance', 'Variance', currency, true), int('used', 'Used', '%'),
      ]} />
    </div>
  );
};

// ---------------------------------------------------------------- P&L per office / consolidated
const PnlByOffice: React.FC<ReportFilters> = f => {
  const { chartOfAccounts, companies, currency, isCollectionLoaded } = useFleet();
  const offices = f.office === 'all' ? companies : companies.filter(c => c.id === f.office);
  // ledger_movements() for the period, one call for every office
  const q = useProfitLossByOffice(chartOfAccounts, offices.map(o => o.id), { startDate: f.from || undefined, endDate: f.to || undefined });
  if (q.error) return <Failed error={q.error.message} onRetry={() => { void q.refetch(); }} />;
  if (!q.data || !isCollectionLoaded('chartOfAccounts')) return <Loading />;
  const byOffice = q.data;
  const rows = offices.map(o => {
    const p = byOffice.get(o.id)!;
    return { id: o.id, office: o.name, revenue: p.totalRevenue, direct: p.totalDirectCosts, gross: p.grossProfit, opex: p.totalOperatingExpenses, depreciation: p.depreciationExpense, net: p.netProfit, margin: p.netProfitMarginPercentage };
  });
  return (
    <div className="space-y-2">
      <Note>From posted journals in the period, per office. Offices with no postings show zero.</Note>
      <ReportTable rows={rows} filename="PnL_By_Office" columns={[
        text('office', 'Office'), money('revenue', 'Revenue', currency), money('direct', 'Direct costs', currency), money('gross', 'Gross profit', currency),
        money('opex', 'Operating expenses', currency), money('depreciation', 'Depreciation', currency), money('net', 'Net profit', currency, true), int('margin', 'Net margin', '%'),
      ]} />
    </div>
  );
};

const ConsolidatedPnl: React.FC<ReportFilters> = f => {
  const { chartOfAccounts, currency, isCollectionLoaded } = useFleet();
  const q = useProfitLoss(chartOfAccounts, 'all', { startDate: f.from || undefined, endDate: f.to || undefined });
  if (q.error) return <Failed error={q.error.message} onRetry={() => { void q.refetch(); }} />;
  if (!q.data || !isCollectionLoaded('chartOfAccounts')) return <Loading />;
  const p = q.data;
  const rows: Row[] = [
    ...p.revenues.map(r => ({ id: `r${r.accountCode}`, section: 'Revenue', line: `${r.accountCode} ${r.accountName}`, amount: r.amount })),
    { id: 'tr', section: 'Revenue', line: 'Total revenue', amount: p.totalRevenue },
    ...p.directCosts.map((c, i) => ({ id: `d${i}`, section: 'Direct costs', line: c.category, amount: c.amount })),
    { id: 'gp', section: 'Gross profit', line: 'Gross profit', amount: p.grossProfit },
    ...p.operatingExpenses.map(o => ({ id: `o${o.accountCode}`, section: 'Operating expenses', line: `${o.accountCode} ${o.accountName}`, amount: o.amount })),
    { id: 'dep', section: 'Depreciation', line: 'Depreciation', amount: p.depreciationExpense },
    { id: 'np', section: 'Net profit', line: 'Net profit', amount: p.netProfit },
  ];
  return (
    <div className="space-y-2">
      <Note>All offices you can see, added together. Inter-office balances sit on the balance sheet (1600) and net to zero, so nothing is eliminated here.</Note>
      <ReportTable rows={rows} filename="Consolidated_PnL" columns={[text('section', 'Section'), text('line', 'Line'), money('amount', 'Amount', currency, true)]} />
    </div>
  );
};

export const EXTRA_REPORTS: ExtraReport[] = [
  { id: 'fleet-utilization', group: 'Fleet & Asset Reports', name: 'Fleet Utilization', desc: 'Kilometres, services and availability per vehicle', render: FleetUtilization },
  { id: 'expiry-report', group: 'Fleet & Asset Reports', name: 'Expiry Report', desc: 'Registrations, insurance, licences, staff papers, documents', render: ExpiryReport },
  { id: 'expense-category', group: 'Maintenance & Operations Reports', name: 'Expenses by Category', desc: 'Approved expenses per office and category', render: ExpenseByCategory },
  { id: 'payroll-summary', group: 'Maintenance & Operations Reports', name: 'Payroll Summary', desc: 'Gross, deductions and net pay per run', render: PayrollSummary },
  { id: 'client-statement', group: 'Financial & Invoice Reports', name: 'Client Statement', desc: 'Invoices, credits and receipts with running balance', render: p => <PartyStatement kind="Customer" {...p} /> },
  { id: 'supplier-statement', group: 'Financial & Invoice Reports', name: 'Supplier Statement', desc: 'Bills, credits and payments with running balance', render: p => <PartyStatement kind="Supplier" {...p} /> },
  { id: 'budget-vs-actual', group: 'Financial & Invoice Reports', name: 'Budget vs Actual', desc: 'Approved budget against posted journals', render: BudgetVsActualReport },
  { id: 'pnl-office', group: 'Financial & Invoice Reports', name: 'P&L per Office', desc: 'Revenue, costs and net profit per office', render: PnlByOffice },
  { id: 'pnl-consolidated', group: 'Financial & Invoice Reports', name: 'Consolidated P&L', desc: 'All offices together, line by line', render: ConsolidatedPnl },
];

/** Modules a user needs to see each report (UI only; RLS decides what data comes back). */
export const REPORT_MODULE: Record<string, string> = {
  'fleet-utilization': 'vehicles', 'expiry-report': 'vehicles', 'expense-category': 'expenses', 'payroll-summary': 'payroll',
  'client-statement': 'invoices', 'supplier-statement': 'invoices', 'budget-vs-actual': 'budgets', 'pnl-office': 'financial-statements',
  'pnl-consolidated': 'financial-statements',
  'vehicle-master': 'vehicles', 'vehicle-asset': 'vehicles', 'depreciation-report': 'fixed-assets', 'cost-per-km': 'vehicles',
  'maintenance-cost': 'maintenance', 'oil-report': 'oil', 'tyre-report': 'tyres', 'accident-report': 'accidents', 'expense-report': 'expenses',
  'purchase-invoices': 'invoices', 'sales-invoices': 'invoices', 'reconciliation-report': 'reconciliation', 'payments-report': 'payments',
  'ap-aging': 'invoices', 'ar-aging': 'invoices', 'tax-report': 'invoices',
};
