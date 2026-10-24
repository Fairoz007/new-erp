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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Profit & Loss Statement (Income Statement)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Real-time income, direct logistics operational costs, gross margin, operating overheads, and net profit.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button variant="primary" size="md" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Operating Revenue"
          value={formatCurrency(pnl.totalRevenue, currency)}
          subValue="Haulage & Rentals"
          isHero={true}
        />
        <StatCard
          title="Direct Operating Costs"
          value={formatCurrency(pnl.totalDirectCosts, currency)}
          subValue="Fuel, tyres, oil & maintenance"
          trend={{ value: 'Cost of Sales', direction: 'down' }}
        />
        <StatCard
          title="Gross Profit"
          value={formatCurrency(pnl.grossProfit, currency)}
          subValue={`${pnl.grossProfitMarginPercentage}% Gross Margin`}
          trend={{ value: `${pnl.grossProfitMarginPercentage}%`, direction: 'up' }}
        />
        <StatCard
          title="Net Profit (After Depr)"
          value={formatCurrency(pnl.netProfit, currency)}
          subValue={`${pnl.netProfitMarginPercentage}% Net Margin`}
          trend={{ value: 'Net Surplus', direction: 'up' }}
        />
      </div>

      {/* P&L Detailed Statement Table */}
      <Card className="p-6 sm:p-8 bg-white border border-slate-700 shadow-card rounded-[24px]">
        <div className="space-y-6">
          <div className="text-center pb-5 border-b border-slate-700">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-100 uppercase tracking-wide">
              CONSOLIDATED STATEMENT OF PROFIT OR LOSS
            </h2>
            <p className="text-xs text-slate-400 mt-1">For Period Ending 22 August 2026 • Reporting Currency: {currency}</p>
          </div>

          {/* 1. REVENUE SECTION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#086343] uppercase tracking-wider">1. Operating Revenue</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.revenues.map(rev => (
                <div key={rev.accountCode} className="flex justify-between py-2.5">
                  <span className="text-slate-300 font-medium">{rev.accountName} ({rev.accountCode})</span>
                  <span className="font-mono font-bold text-slate-100">{formatCurrency(rev.amount, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5 font-bold text-sm text-[#086343] bg-[#DCEFE5]/50 px-3 rounded-xl mt-1">
                <span>Total Operating Revenue</span>
                <span>{formatCurrency(pnl.totalRevenue, currency)}</span>
              </div>
            </div>
          </div>

          {/* 2. DIRECT OPERATING COSTS */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-rose-600 uppercase tracking-wider">2. Direct Fleet Operating Costs</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.directCosts.map((cost, idx) => (
                <div key={idx} className="flex justify-between py-2.5">
                  <span className="text-slate-300 font-medium">{cost.category} Operational Expense</span>
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
            <h3 className="text-xs font-bold text-[#D9A441] uppercase tracking-wider">3. Administrative Overheads & Depreciation</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.operatingExpenses.map(opex => (
                <div key={opex.accountCode} className="flex justify-between py-2.5">
                  <span className="text-slate-300 font-medium">{opex.accountName} ({opex.accountCode})</span>
                  <span className="font-mono text-slate-300">({formatCurrency(opex.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5">
                <span className="text-slate-300 font-medium">Motor Vehicles Fleet Depreciation (5080)</span>
                <span className="font-mono text-[#086343] font-semibold">({formatCurrency(pnl.depreciationExpense, currency)})</span>
              </div>
              <div className="flex justify-between py-2.5 font-bold text-sm text-[#D9A441] bg-amber-50 px-3 rounded-xl mt-1">
                <span>Total Overheads & Depreciation</span>
                <span>({formatCurrency(pnl.totalOperatingExpenses + pnl.depreciationExpense, currency)})</span>
              </div>
            </div>
          </div>

          {/* NET PROFIT GRAND TOTAL */}
          <div className="flex justify-between py-4 px-6 bg-[#086343] text-white rounded-2xl shadow-card font-extrabold text-lg">
            <span>NET PROFIT FOR THE PERIOD</span>
            <span className="font-mono">{formatCurrency(pnl.netProfit, currency)} ({pnl.netProfitMarginPercentage}%)</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
