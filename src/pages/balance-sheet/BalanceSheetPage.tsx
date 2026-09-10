import React from 'react';
import { Scale, Printer, CheckCircle2, ShieldCheck, DollarSign } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';

export const BalanceSheetPage: React.FC = () => {
  const { getCompanyBalanceSheet, currency } = useFleet();
  const bs = getCompanyBalanceSheet();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-indigo-400" />
            <span>Balance Sheet (Statement of Financial Position)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Audited assets, liabilities, equity, and net fleet capital value upholding the fundamental accounting equation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Balance Sheet
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Assets"
          value={formatCurrency(bs.assets.totalAssets, currency)}
          subValue={`Net Fleet: ${formatCurrency(bs.assets.netVehiclesValue, currency)}`}
          icon={<Scale className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Total Liabilities"
          value={formatCurrency(bs.liabilities.totalLiabilities, currency)}
          subValue={`AP: ${formatCurrency(bs.liabilities.accountsPayable, currency)}`}
          icon={<Scale className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Total Equity"
          value={formatCurrency(bs.equity.totalEquity, currency)}
          subValue={`Capital + Retained Earnings`}
          icon={<Scale className="w-4 h-4" />}
          variant="purple"
        />
        <StatCard
          title="Equation Balance"
          value={bs.isBalanced ? 'BALANCED' : 'OUT OF BALANCE'}
          subValue="Assets = Liabilities + Equity"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          variant="emerald"
        />
      </div>

      {/* Balance Sheet Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ASSETS COLUMN */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-indigo-400 uppercase tracking-wide pb-3 border-b border-slate-800">
            ASSETS
          </h2>

          <div className="space-y-6 mt-4 text-xs">
            {/* Current Assets */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Current Assets</h3>
              <div className="divide-y divide-slate-800">
                {bs.assets.currentAssets.map((a, idx) => (
                  <div key={idx} className="flex justify-between py-2">
                    <span className="text-slate-400">{a.name}</span>
                    <span className="font-mono text-slate-200">{formatCurrency(a.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-bold text-slate-200">
                  <span>Total Current Assets</span>
                  <span>{formatCurrency(bs.assets.totalCurrentAssets, currency)}</span>
                </div>
              </div>
            </div>

            {/* Non-Current / Fixed Assets */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Non-Current Assets (Fixed Fleet)</h3>
              <div className="divide-y divide-slate-800">
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Motor Vehicles Fleet at Acquisition Cost</span>
                  <span className="font-mono text-slate-200">{formatCurrency(bs.assets.vehiclesCost, currency)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Less: Accumulated Depreciation</span>
                  <span className="font-mono text-rose-400">({formatCurrency(bs.assets.accumulatedDepreciation, currency)})</span>
                </div>
                <div className="flex justify-between py-2 font-semibold text-indigo-300 bg-slate-900/50 px-2 rounded">
                  <span>Net Book Value of Motor Vehicles</span>
                  <span>{formatCurrency(bs.assets.netVehiclesValue, currency)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Diagnostic Workshop & Garage Equipment</span>
                  <span className="font-mono text-slate-200">{formatCurrency(12400, currency)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-slate-200">
                  <span>Total Fixed Assets</span>
                  <span>{formatCurrency(bs.assets.totalFixedAssets, currency)}</span>
                </div>
              </div>
            </div>

            {/* TOTAL ASSETS */}
            <div className="flex justify-between py-3 px-4 bg-indigo-950/50 border border-indigo-500/40 rounded-xl font-bold text-sm text-slate-100">
              <span>TOTAL ASSETS</span>
              <span className="text-indigo-300">{formatCurrency(bs.assets.totalAssets, currency)}</span>
            </div>
          </div>
        </Card>

        {/* LIABILITIES & EQUITY COLUMN */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-amber-400 uppercase tracking-wide pb-3 border-b border-slate-800">
            LIABILITIES & EQUITY
          </h2>

          <div className="space-y-6 mt-4 text-xs">
            {/* Current Liabilities */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Current Liabilities</h3>
              <div className="divide-y divide-slate-800">
                {bs.liabilities.currentLiabilities.map((l, idx) => (
                  <div key={idx} className="flex justify-between py-2">
                    <span className="text-slate-400">{l.name}</span>
                    <span className="font-mono text-slate-200">{formatCurrency(l.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-bold text-slate-200">
                  <span>Total Current Liabilities</span>
                  <span>{formatCurrency(bs.liabilities.totalCurrentLiabilities, currency)}</span>
                </div>
              </div>
            </div>

            {/* Long-Term Liabilities */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Long-Term Liabilities</h3>
              <div className="divide-y divide-slate-800">
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Commercial Vehicle Term Bank Loans</span>
                  <span className="font-mono text-slate-200">{formatCurrency(bs.liabilities.vehicleLoans, currency)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-slate-200">
                  <span>Total Long-Term Liabilities</span>
                  <span>{formatCurrency(bs.liabilities.totalLongTermLiabilities, currency)}</span>
                </div>
              </div>
            </div>

            {/* Shareholders' Equity */}
            <div className="space-y-2">
              <h3 className="font-bold text-purple-400 uppercase tracking-wider text-[11px]">Shareholders&apos; Equity</h3>
              <div className="divide-y divide-slate-800">
                {bs.equity.items.map((eq, idx) => (
                  <div key={idx} className="flex justify-between py-2">
                    <span className="text-slate-400">{eq.name}</span>
                    <span className="font-mono text-slate-200">{formatCurrency(eq.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-bold text-purple-300">
                  <span>Total Shareholders&apos; Equity</span>
                  <span>{formatCurrency(bs.equity.totalEquity, currency)}</span>
                </div>
              </div>
            </div>

            {/* TOTAL LIABILITIES & EQUITY */}
            <div className="flex justify-between py-3 px-4 bg-amber-950/50 border border-amber-500/40 rounded-xl font-bold text-sm text-slate-100">
              <span>TOTAL LIABILITIES & EQUITY</span>
              <span className="text-amber-300">{formatCurrency(bs.totalLiabilitiesAndEquity, currency)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
