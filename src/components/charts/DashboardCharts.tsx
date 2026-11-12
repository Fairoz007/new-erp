import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '../../utils/financial';
import { useFleet } from '../../context/FleetContext';
import type { MaintenanceRecord } from '../../types/maintenance';
import type { DaySeries } from '../../services/queries';

// Every chart below is drawn from real ERP figures (daily totals aggregated in the database by
// dashboard_series(), or records already loaded). With no data they render an explicit empty
// state, never placeholder figures.
const EmptyChart: React.FC<{ message: string; height?: number }> = ({ message, height = 250 }) => (
  <div style={{ height }} className="w-full flex items-center justify-center text-xs text-slate-400 text-center px-6">
    {message}
  </div>
);

/** Loading or error state of a chart whose figures come from the server. */
export const ChartState: React.FC<{ loading?: boolean; error?: Error; onRetry?: () => void; height?: number; children: React.ReactNode }> = ({ loading, error, onRetry, height = 250, children }) => {
  if (error) return (
    <div role="alert" style={{ height }} className="w-full flex flex-col items-center justify-center gap-2 text-xs text-rose-500 text-center px-6">
      <span>Could not load the figures: {error.message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline text-slate-300 hover:text-slate-100">Retry</button>}
    </div>
  );
  if (loading) return <div style={{ height }} aria-busy="true" className="w-full flex items-center justify-center text-xs text-slate-400">Loading…</div>;
  return <>{children}</>;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// last n calendar months ending with the current one
const lastMonths = (n: number) => {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()] });
  }
  return out;
};
const ym = (d?: string) => (d ? d.slice(0, 7) : '');

// Shared clean reference tooltip
export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-700 p-3 rounded-2xl shadow-elevated text-xs space-y-1.5 z-50">
        <p className="font-bold text-slate-100">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-bold text-slate-100 tabular-nums">
              {typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const kFormat = (val: number) => (Math.abs(val) >= 1000 ? `${val / 1000}k` : `${val}`);

// 1. Revenue vs operating cost (last 6 months). Revenue = sales invoices (credit notes deducted,
//    cancelled excluded); cost = approved vehicle expenses + maintenance records. `series` holds
//    those daily totals (dashboard_series) covering at least the last 6 calendar months.

// Text alternative for a chart (WCAG 1.1.1): the drawing is hidden from screen readers and the same
// numbers are given as a table that only screen readers read.
const ChartFigure: React.FC<{ label: string; columns: string[]; rows: (string | number)[][]; className?: string; children: React.ReactNode }> = ({ label, columns, rows, className, children }) => (
  <figure role="group" aria-label={label} className={className ?? 'h-[250px] w-full'}>
    <div aria-hidden="true" className="h-full w-full">{children}</div>
    <table className="sr-only">
      <caption>{label}</caption>
      <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{typeof v === 'number' ? v.toFixed(3) : v}</td>)}</tr>)}</tbody>
    </table>
  </figure>
);

export const RevenueVsExpenseChart: React.FC<{ series: DaySeries[] }> = ({ series }) => {
  const data = lastMonths(6).map(m => {
    const days = series.filter(d => ym(d.day) === m.key);
    const Revenue = days.reduce((s, d) => s + d.sales, 0);
    const Expenses = days.reduce((s, d) => s + d.expenses + d.maintenance, 0);
    return { month: m.label, Revenue, Expenses };
  });
  if (data.every(d => d.Revenue === 0 && d.Expenses === 0)) {
    return <EmptyChart message="No revenue or operating cost recorded in the last 6 months." />;
  }

  return (
    <ChartFigure label={'Revenue and operating cost, last 6 months'} columns={['Month', 'Revenue', 'Expenses']} rows={data.map(d => [d.month, d.Revenue, d.Expenses])}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#086343" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#086343" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#626B67" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#626B67" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE8" vertical={false} />
          <XAxis dataKey="month" stroke="#626B67" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7EBE8' }} />
          <YAxis stroke="#626B67" fontSize={11} tickLine={false} axisLine={false} tickFormatter={kFormat} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#626B67' }} />
          <Area type="monotone" dataKey="Revenue" stroke="#086343" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
          <Area type="monotone" dataKey="Expenses" stroke="#626B67" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
};

// 2. Capsule bar chart: operating spend (approved expenses + maintenance) per day for the last 7
//    days, from the dashboard_series() daily totals.
export const ReferencePillBarChart: React.FC<{
  series: DaySeries[];
  currency?: string;
}> = ({ series, currency = 'OMR' }) => {
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const byDay = new Map(series.map(d => [d.day, d.expenses + d.maintenance]));
  const days = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - idx));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const amount = byDay.get(key) ?? 0;
    return { day: DAY_LABELS[d.getDay()], key, amount };
  });
  const max = Math.max(...days.map(d => d.amount));
  if (max <= 0) return <EmptyChart height={230} message="No expenses or maintenance recorded in the last 7 days." />;

  return (
    <figure role="group" aria-label="Operating spend per day, last 7 days" className="w-full flex flex-col justify-between h-[230px] pt-4">
      <table className="sr-only"><caption>Operating spend per day, last 7 days</caption><thead><tr><th scope="col">Date</th><th scope="col">Amount</th></tr></thead>
        <tbody>{days.map(d => <tr key={d.key}><th scope="row">{d.key}</th><td>{formatCurrency(d.amount, currency)}</td></tr>)}</tbody></table>
      <div aria-hidden="true" className="flex items-end justify-between gap-2.5 h-[170px] px-2 sm:px-4">
        {days.map((item, index) => {
          const heightPercent = item.amount > 0 ? Math.max(6, Math.round((item.amount / max) * 100)) : 2;
          const isPeak = item.amount === max;
          return (
            <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-100 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-md pointer-events-none whitespace-nowrap z-20">
                {formatCurrency(item.amount, currency)}
              </div>
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full max-w-[34px] rounded-full transition-all duration-300 transform group-hover:scale-y-105 ${
                  isPeak ? 'bg-[#086343] shadow-sm' : item.amount > 0 ? 'bg-[#4CAE88]' : 'bg-slate-200'
                }`}
              />
              <span className="mt-3 text-xs font-semibold text-slate-400 group-hover:text-slate-100 transition-colors" title={item.key}>
                {item.day}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
};

// 3. Maintenance cost by month, split Routine / Corrective / Breakdown (last 6 months)
const ROUTINE = new Set(['General Service', 'Preventive Maintenance']);
const BREAKDOWN = new Set(['Engine Repair', 'Transmission Repair']);
export const MaintenanceTrendChart: React.FC<{ maintenanceRecords: MaintenanceRecord[] }> = ({ maintenanceRecords }) => {
  const data = lastMonths(6).map(m => {
    const rows = maintenanceRecords.filter(r => ym(r.maintenanceDate) === m.key);
    const sum = (f: (c: string) => boolean) => rows.filter(r => f(r.category)).reduce((s, r) => s + r.totalCost, 0);
    return {
      month: m.label,
      Routine: sum(c => ROUTINE.has(c)),
      Breakdown: sum(c => BREAKDOWN.has(c)),
      Corrective: sum(c => !ROUTINE.has(c) && !BREAKDOWN.has(c)),
    };
  });
  if (data.every(d => d.Routine + d.Corrective + d.Breakdown === 0)) {
    return <EmptyChart message="No maintenance cost recorded in the last 6 months." />;
  }

  return (
    <ChartFigure label={'Maintenance cost by month and type, last 6 months'} columns={['Month', 'Routine', 'Corrective', 'Breakdown']} rows={data.map(d => [d.month, d.Routine, d.Corrective, d.Breakdown])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE8" vertical={false} />
          <XAxis dataKey="month" stroke="#626B67" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7EBE8' }} />
          <YAxis stroke="#626B67" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#626B67' }} />
          <Bar dataKey="Routine" stackId="a" fill="#086343" radius={[0, 0, 0, 0]} barSize={20} />
          <Bar dataKey="Corrective" stackId="a" fill="#D9A441" radius={[0, 0, 0, 0]} barSize={20} />
          <Bar dataKey="Breakdown" stackId="a" fill="#D94B4B" radius={[6, 6, 0, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
};

// 4. Fixed-asset cohorts: historical cost vs current net book value, grouped by purchase year.
//    Reads fixedAssets from the context so existing call sites (<AssetDepreciationChart />) keep working.
export const AssetDepreciationChart: React.FC = () => {
  const { fixedAssets } = useFleet();
  const byYear = new Map<string, { year: string; Cost: number; BookValue: number }>();
  fixedAssets.forEach(a => {
    const year = (a.purchaseDate || '').slice(0, 4) || 'n/a';
    const row = byYear.get(year) ?? { year, Cost: 0, BookValue: 0 };
    row.Cost += a.purchaseCost;
    row.BookValue += a.currentBookValue;
    byYear.set(year, row);
  });
  const data = [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
  if (data.length === 0) return <EmptyChart message="No fixed assets registered yet." />;

  return (
    <ChartFigure label={'Fixed assets by purchase year: historical cost and net book value'} columns={['Purchase year', 'Historical cost', 'Net book value']} rows={data.map(d => [d.year, d.Cost, d.BookValue])}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#626B67" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#626B67" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#086343" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#086343" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE8" vertical={false} />
          <XAxis dataKey="year" stroke="#626B67" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7EBE8' }} />
          <YAxis stroke="#626B67" fontSize={11} tickLine={false} axisLine={false} tickFormatter={kFormat} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#626B67' }} />
          <Area type="monotone" dataKey="Cost" name="Historical Cost" stroke="#626B67" strokeWidth={2} fillOpacity={1} fill="url(#colorCost)" />
          <Area type="monotone" dataKey="BookValue" name="Net Book Value" stroke="#086343" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
};
