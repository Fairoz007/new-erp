import React, { useState } from 'react';
import { Printer, Calendar } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { getCompanyProfitLoss } from '../../services/accounting';

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-2.5 text-slate-400 italic">{text}</div>
);

export const ProfitLossPage: React.FC = () => {
  const { chartOfAccounts, journalEntries, selectedCompanyId, selectedCompany, currency } = useFleet();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(today);

  // Built from posted journal lines in the period, classified by account category/subcategory (not by name).
  const pnl = getCompanyProfitLoss(chartOfAccounts, journalEntries, selectedCompanyId,
    { startDate: startDate || undefined, endDate: endDate || undefined });
  const hasActivity = pnl.revenues.length + pnl.directCosts.length + pnl.operatingExpenses.length > 0 || pnl.depreciationExpense !== 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Profit & Loss Statement (Income Statement)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Posted revenue and expense movements for the selected period, grouped by account category.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-4 h-4" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} aria-label="Start date"
              className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-100" />
            <span>to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} aria-label="End date"
              className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-100" />
          </div>
          <Button variant="primary" size="md" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Total Revenue" value={formatCurrency(pnl.totalRevenue, currency)} subValue={`${pnl.revenues.length} revenue account(s)`} isHero={true} />
        <StatCard title="Direct Operating Costs" value={formatCurrency(pnl.totalDirectCosts, currency)} subValue="Accounts in a 'Direct' subcategory" />
        <StatCard title="Gross Profit" value={formatCurrency(pnl.grossProfit, currency)} subValue={`${pnl.grossProfitMarginPercentage}% gross margin`} />
        <StatCard title="Net Profit (After Depr)" value={formatCurrency(pnl.netProfit, currency)} subValue={`${pnl.netProfitMarginPercentage}% net margin`} />
      </div>

      {/* P&L Detailed Statement Table */}
      <Card className="p-6 sm:p-8 bg-white border border-slate-700 shadow-card rounded-[24px]">
        <div className="space-y-6">
          <div className="text-center pb-5 border-b border-slate-700">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-100 uppercase tracking-wide">
              {selectedCompanyId === 'all' ? 'Consolidated Statement of Profit or Loss' : `Statement of Profit or Loss — ${selectedCompany?.name ?? ''}`}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {startDate ? formatDate(startDate) : 'Beginning'} – {endDate ? formatDate(endDate) : 'today'} • Reporting Currency: {currency}
            </p>
          </div>

          {!hasActivity && (
            <p className="text-center text-sm text-slate-400 py-6">No revenue or expense has been posted in this period.</p>
          )}

          {/* 1. REVENUE SECTION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#086343] uppercase tracking-wider">1. Revenue</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.revenues.length === 0 && <EmptyRow text="No revenue posted." />}
              {pnl.revenues.map(rev => (
                <div key={rev.accountCode} className="flex justify-between py-2.5">
                  <span className="text-slate-300 font-medium">{rev.accountName} ({rev.accountCode})</span>
                  <span className="font-mono font-bold text-slate-100">{formatCurrency(rev.amount, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5 font-bold text-sm text-[#086343] bg-[#DCEFE5]/50 px-3 rounded-xl mt-1">
                <span>Total Revenue</span>
                <span>{formatCurrency(pnl.totalRevenue, currency)}</span>
              </div>
            </div>
          </div>

          {/* 2. DIRECT OPERATING COSTS */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-rose-600 uppercase tracking-wider">2. Direct Operating Costs</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.directCosts.length === 0 && <EmptyRow text="No direct costs posted." />}
              {pnl.directCosts.map(cost => (
                <div key={cost.category} className="flex justify-between py-2.5">
                  <span className="text-slate-300 font-medium">{cost.category}</span>
                  <span className="font-mono font-semibold text-rose-600">({formatCurrency(cost.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5 font-bold text-sm text-rose-600 bg-rose-50 px-3 rounded-xl mt-1">
                <span>Total Direct Operating Costs</span>
                <span>({formatCurrency(pnl.totalDirectCosts, currency)})</span>
              </div>
            </div>
          </div>

          {/* GROSS PROFIT SUB-TOTAL */}
          <div className="flex justify-between py-3.5 px-5 bg-[#DCEFE5] border border-[#BDE2D0] rounded-2xl font-bold text-base text-[#06452F]">
            <span>GROSS PROFIT (Revenue - Direct Costs)</span>
            <span className="font-extrabold text-[#086343] font-mono">{formatCurrency(pnl.grossProfit, currency)} ({pnl.grossProfitMarginPercentage}%)</span>
          </div>

          {/* 3. OPERATING OVERHEADS & DEPRECIATION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#D9A441] uppercase tracking-wider">3. Operating Expenses & Depreciation</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.operatingExpenses.length === 0 && <EmptyRow text="No operating expenses posted." />}
              {pnl.operatingExpenses.map(opex => (
                <div key={opex.accountCode} className="flex justify-between py-2.5">
                  <span className="text-slate-300 font-medium">{opex.accountName} ({opex.accountCode})</span>
                  <span className="font-mono text-slate-300">({formatCurrency(opex.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5">
                <span className="text-slate-300 font-medium">Depreciation (accounts in the Depreciation subcategory)</span>
                <span className="font-mono text-[#086343] font-semibold">({formatCurrency(pnl.depreciationExpense, currency)})</span>
              </div>
              <div className="flex justify-between py-2.5 font-bold text-sm text-[#D9A441] bg-amber-50 px-3 rounded-xl mt-1">
                <span>Total Operating Expenses & Depreciation</span>
                <span>({formatCurrency(pnl.totalOperatingExpenses + pnl.depreciationExpense, currency)})</span>
              </div>
            </div>
          </div>

          {/* NET PROFIT GRAND TOTAL */}
          <div className="flex justify-between py-4 px-6 bg-[#086343] text-white rounded-2xl shadow-card font-extrabold text-lg">
            <span>NET PROFIT FOR THE PERIOD</span>
            <span className="font-mono">{formatCurrency(pnl.netProfit, currency)} ({pnl.netProfitMarginPercentage}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Finance costs are included in operating expenses; EBITDA {formatCurrency(pnl.ebitda, currency)} is before depreciation only.
          </p>
        </div>
      </Card>
    </div>
  );
};
