import React from 'react';
import { TrendingUp, Download, Printer, DollarSign, Receipt, Percent } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';

export const ProfitLossPage: React.FC = () => {
  const { getCompanyProfitLoss, selectedCompanyId, currency } = useFleet();
  const pnl = getCompanyProfitLoss();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <span>Profit & Loss Statement (Income Statement)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time income, direct logistics operational costs, gross margin, operating overheads, and net profit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Operating Revenue"
          value={formatCurrency(pnl.totalRevenue, currency)}
          subValue="Haulage & Rentals"
          icon={<DollarSign className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Direct Operating Costs"
          value={formatCurrency(pnl.totalDirectCosts, currency)}
          subValue="Fuel, tyres, oil & maintenance"
          icon={<Receipt className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Gross Profit"
          value={formatCurrency(pnl.grossProfit, currency)}
          subValue={`${pnl.grossProfitMarginPercentage}% Gross Margin`}
          icon={<TrendingUp className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Net Profit (After Depreciation)"
          value={formatCurrency(pnl.netProfit, currency)}
          subValue={`${pnl.netProfitMarginPercentage}% Net Margin`}
          icon={<Percent className="w-4 h-4" />}
          variant="purple"
        />
      </div>

      {/* P&L Detailed Statement Table */}
      <Card className="p-6 sm:p-8">
        <div className="space-y-6">
          <div className="text-center pb-4 border-b border-slate-800">
            <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wide">CONSOLIDATED STATEMENT OF PROFIT OR LOSS</h2>
            <p className="text-xs text-slate-400 mt-0.5">For Period Ending 22 August 2026 • Reporting Currency: {currency}</p>
          </div>

          {/* 1. REVENUE SECTION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">1. Operating Revenue</h3>
            <div className="divide-y divide-slate-800 text-xs">
              {pnl.revenues.map(rev => (
                <div key={rev.accountCode} className="flex justify-between py-2">
                  <span className="text-slate-300">{rev.accountName} ({rev.accountCode})</span>
                  <span className="font-mono font-semibold text-slate-100">{formatCurrency(rev.amount, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 font-bold text-sm text-emerald-400 bg-slate-900/50 px-2 rounded">
                <span>Total Operating Revenue</span>
                <span>{formatCurrency(pnl.totalRevenue, currency)}</span>
              </div>
            </div>
          </div>

          {/* 2. DIRECT OPERATING COSTS */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">2. Direct Fleet Operating Costs</h3>
            <div className="divide-y divide-slate-800 text-xs">
              {pnl.directCosts.map((cost, idx) => (
                <div key={idx} className="flex justify-between py-2">
                  <span className="text-slate-300">{cost.category} Operational Expense</span>
                  <span className="font-mono text-rose-300">({formatCurrency(cost.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between py-2 font-bold text-sm text-rose-400 bg-slate-900/50 px-2 rounded">
                <span>Total Direct Operating Costs</span>
                <span>({formatCurrency(pnl.totalDirectCosts, currency)})</span>
              </div>
            </div>
          </div>

          {/* GROSS PROFIT SUB-TOTAL */}
          <div className="flex justify-between py-3 px-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl font-bold text-base text-slate-100">
            <span>GROSS PROFIT (Revenue - Direct Costs)</span>
            <span className="text-emerald-400">{formatCurrency(pnl.grossProfit, currency)} ({pnl.grossProfitMarginPercentage}%)</span>
          </div>

          {/* 3. OPERATING OVERHEADS & DEPRECIATION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">3. Administrative Overheads & Depreciation</h3>
            <div className="divide-y divide-slate-800 text-xs">
              {pnl.operatingExpenses.map(opex => (
                <div key={opex.accountCode} className="flex justify-between py-2">
                  <span className="text-slate-300">{opex.accountName} ({opex.accountCode})</span>
                  <span className="font-mono text-slate-300">({formatCurrency(opex.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between py-2">
                <span className="text-slate-300">Motor Vehicles Fleet Depreciation (5080)</span>
                <span className="font-mono text-purple-300">({formatCurrency(pnl.depreciationExpense, currency)})</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-sm text-amber-400 bg-slate-900/50 px-2 rounded">
                <span>Total Overheads & Depreciation</span>
                <span>({formatCurrency(pnl.totalOperatingExpenses + pnl.depreciationExpense, currency)})</span>
              </div>
            </div>
          </div>

          {/* NET PROFIT GRAND TOTAL */}
          <div className="flex justify-between py-4 px-5 bg-emerald-950/60 border-2 border-emerald-500/50 rounded-xl font-bold text-lg text-slate-100">
            <span>NET PROFIT FOR THE PERIOD</span>
            <span className="text-emerald-400">{formatCurrency(pnl.netProfit, currency)} ({pnl.netProfitMarginPercentage}%)</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
