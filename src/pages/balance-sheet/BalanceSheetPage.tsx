import React, { useState } from 'react';
import { Scale, Printer, CheckCircle2, ShieldCheck, DollarSign } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { getCompanyBalanceSheet } from '../../services/accounting';

const Empty: React.FC<{ text: string }> = ({ text }) => <div className="py-2.5 text-slate-400 italic">{text}</div>;

export const BalanceSheetPage: React.FC = () => {
  const { chartOfAccounts, journalEntries, selectedCompanyId, currency } = useFleet();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  // Opening balances + posted journal lines up to the date; no plug figures.
  const bs = getCompanyBalanceSheet(chartOfAccounts, journalEntries, selectedCompanyId, asOfDate);
  const isEmpty = bs.assets.totalAssets === 0 && bs.liabilities.totalLiabilities === 0 && bs.equity.totalEquity === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Balance Sheet (Statement of Financial Position)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Assets, liabilities and equity from account opening balances plus posted journals up to the selected date.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} aria-label="As of date"
            className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-100" />
          <Button variant="primary" size="md" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Balance Sheet
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Assets"
          value={formatCurrency(bs.assets.totalAssets, currency)}
          subValue={`Fixed (net): ${formatCurrency(bs.assets.totalFixedAssets, currency)}`}
          isHero={true}
        />
        <StatCard
          title="Total Liabilities"
          value={formatCurrency(bs.liabilities.totalLiabilities, currency)}
          subValue={`AP: ${formatCurrency(bs.liabilities.accountsPayable, currency)}`}
        />
        <StatCard
          title="Total Equity"
          value={formatCurrency(bs.equity.totalEquity, currency)}
          subValue="Equity accounts + unclosed profit"
        />
        <StatCard
          title="Equation Balance"
          value={isEmpty ? 'NO DATA' : bs.isBalanced ? 'BALANCED' : 'OUT OF BALANCE'}
          subValue={isEmpty ? 'Nothing posted yet' : `Difference: ${formatCurrency(bs.assets.totalAssets - bs.totalLiabilitiesAndEquity, currency)}`}
        />
      </div>

      {/* Balance Sheet Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ASSETS COLUMN */}
        <Card className="p-6 sm:p-7 bg-white border border-slate-700 shadow-card rounded-[24px]">
          <h2 className="text-base font-extrabold text-[#086343] uppercase tracking-wider pb-3.5 border-b border-slate-700">
            ASSETS
          </h2>

          <div className="space-y-6 mt-4 text-xs">
            {/* Current Assets */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Current Assets</h3>
              <div className="divide-y divide-slate-700/80">
                {bs.assets.currentAssets.length === 0 && <Empty text="None" />}
                {bs.assets.currentAssets.map((a, idx) => (
                  <div key={idx} className="flex justify-between py-2.5">
                    <span className="text-slate-300 font-medium">{a.name}</span>
                    <span className="font-mono font-bold text-slate-100">{formatCurrency(a.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 font-bold text-slate-100 bg-slate-850 px-3 rounded-xl mt-1">
                  <span>Total Current Assets</span>
                  <span>{formatCurrency(bs.assets.totalCurrentAssets, currency)}</span>
                </div>
              </div>
            </div>

            {/* Non-Current / Fixed Assets */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Non-Current (Fixed) Assets</h3>
              <div className="divide-y divide-slate-700/80">
                {bs.assets.fixedAssets.length === 0 && <Empty text="None" />}
                {bs.assets.fixedAssets.map((a, idx) => (
                  <div key={idx} className="flex justify-between py-2.5">
                    <span className="text-slate-300 font-medium">{a.name}</span>
                    <span className={`font-mono font-bold ${a.amount < 0 ? 'text-rose-600' : 'text-slate-100'}`}>
                      {a.amount < 0 ? `(${formatCurrency(-a.amount, currency)})` : formatCurrency(a.amount, currency)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 font-bold text-slate-100 bg-slate-850 px-3 rounded-xl mt-1">
                  <span>Total Fixed Assets</span>
                  <span>{formatCurrency(bs.assets.totalFixedAssets, currency)}</span>
                </div>
              </div>
            </div>

            {/* TOTAL ASSETS */}
            <div className="flex justify-between py-3.5 px-5 bg-[#086343] text-white rounded-2xl shadow-card font-extrabold text-sm sm:text-base">
              <span>TOTAL ASSETS</span>
              <span className="font-mono">{formatCurrency(bs.assets.totalAssets, currency)}</span>
            </div>
          </div>
        </Card>

        {/* LIABILITIES & EQUITY COLUMN */}
        <Card className="p-6 sm:p-7 bg-white border border-slate-700 shadow-card rounded-[24px]">
          <h2 className="text-base font-extrabold text-[#D9A441] uppercase tracking-wider pb-3.5 border-b border-slate-700">
            LIABILITIES & EQUITY
          </h2>

          <div className="space-y-6 mt-4 text-xs">
            {/* Current Liabilities */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Current Liabilities</h3>
              <div className="divide-y divide-slate-700/80">
                {bs.liabilities.currentLiabilities.length === 0 && <Empty text="None" />}
                {bs.liabilities.currentLiabilities.map((l, idx) => (
                  <div key={idx} className="flex justify-between py-2.5">
                    <span className="text-slate-300 font-medium">{l.name}</span>
                    <span className="font-mono font-bold text-slate-100">{formatCurrency(l.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 font-bold text-slate-100 bg-slate-850 px-3 rounded-xl mt-1">
                  <span>Total Current Liabilities</span>
                  <span>{formatCurrency(bs.liabilities.totalCurrentLiabilities, currency)}</span>
                </div>
              </div>
            </div>

            {/* Long-Term Liabilities */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Long-Term Liabilities</h3>
              <div className="divide-y divide-slate-700/80">
                {bs.liabilities.longTermLiabilities.length === 0 && <Empty text="None" />}
                {bs.liabilities.longTermLiabilities.map((l, idx) => (
                  <div key={idx} className="flex justify-between py-2.5">
                    <span className="text-slate-300 font-medium">{l.name}</span>
                    <span className="font-mono font-bold text-slate-100">{formatCurrency(l.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 font-bold text-slate-100 bg-slate-850 px-3 rounded-xl mt-1">
                  <span>Total Long-Term Liabilities</span>
                  <span>{formatCurrency(bs.liabilities.totalLongTermLiabilities, currency)}</span>
                </div>
              </div>
            </div>

            {/* Shareholders' Equity */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Shareholders&apos; Equity</h3>
              <div className="divide-y divide-slate-700/80">
                {bs.equity.items.length === 0 && <Empty text="None" />}
                {bs.equity.items.map((eq, idx) => (
                  <div key={idx} className="flex justify-between py-2.5">
                    <span className="text-slate-300 font-medium">{eq.name}</span>
                    <span className="font-mono font-bold text-slate-100">{formatCurrency(eq.amount, currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 font-bold text-slate-100 bg-slate-850 px-3 rounded-xl mt-1">
                  <span>Total Shareholders&apos; Equity</span>
                  <span>{formatCurrency(bs.equity.totalEquity, currency)}</span>
                </div>
              </div>
            </div>

            {/* TOTAL LIABILITIES & EQUITY */}
            <div className="flex justify-between py-3.5 px-5 bg-[#086343] text-white rounded-2xl shadow-card font-extrabold text-sm sm:text-base">
              <span>TOTAL LIABILITIES & EQUITY</span>
              <span className="font-mono">{formatCurrency(bs.totalLiabilitiesAndEquity, currency)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
