import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, todayYmd } from '../../utils/date';
import { profitLossFrom } from '../../services/accounting';
import { useProfitLoss } from '../../services/queries';
import { FilterInput } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';
import { PdfActions } from '../../components/common/PdfActions';
import { tablePdfAction } from '../../utils/export';
import { profitLossRows, statementColumns, STATEMENT_SIGNATURES } from '../../lib/a4/statements';

const StatementLoad: React.FC<{ loading: boolean; error?: Error; onRetry: () => void }> = ({ loading, error, onRetry }) => (
  <Card className="p-8 text-center text-xs bg-white border border-slate-700 rounded-[20px]">
    {error
      ? <span className="text-rose-600">Could not load the ledger totals: {error.message} <button type="button" className="underline font-bold cursor-pointer min-h-[44px] sm:min-h-0" onClick={onRetry}>Retry</button></span>
      : <span className="text-slate-400">{loading ? 'Loading…' : ''}</span>}
  </Card>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-2.5 text-slate-400 italic">{text}</div>
);

export const ProfitLossPage: React.FC = () => {
  const { chartOfAccounts, selectedCompanyId, selectedCompany, currency, isCollectionLoaded } = useFleet();
  const today = todayYmd();
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(today);

  // Built from posted journal lines in the period, classified by account category/subcategory (not by name).
  const range = { startDate: startDate || undefined, endDate: endDate || undefined };
  const q = useProfitLoss(chartOfAccounts, selectedCompanyId, range);
  const accountsLoading = !isCollectionLoaded('chartOfAccounts');
  const ready = !!q.data && !q.error && !accountsLoading;
  const pnl = q.data ?? profitLossFrom([], new Map(), undefined, range);
  const hasActivity = pnl.revenues.length + pnl.directCosts.length + pnl.operatingExpenses.length > 0 || pnl.depreciationExpense !== 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Profit & Loss Statement (Income Statement)"
        description="Posted revenue and expense movements for the selected period, grouped by account category."
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-4 h-4" />
              <FilterInput type="date" value={startDate} onChange={e => setStartDate(e.target.value)} aria-label="Start date"
                 />
              <span>to</span>
              <FilterInput type="date" value={endDate} onChange={e => setEndDate(e.target.value)} aria-label="End date"
                 />
            </div>
            <PdfActions disabled={!ready} printLabel="Print Statement"
              run={print => tablePdfAction(print, 'Profit_and_Loss', 'Statement of Profit or Loss', statementColumns(currency), profitLossRows(pnl, currency),
                { rightAlign: [1], period: { from: startDate || undefined, to: endDate || undefined }, signatures: STATEMENT_SIGNATURES })} />
          </>
        }
      />

{!ready ? <StatementLoad loading={q.loading || accountsLoading} error={q.error} onRetry={() => void q.refetch()} /> : (<>
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
            <h3 className="text-xs font-bold text-brand-500 uppercase tracking-wider">1. Revenue</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.revenues.length === 0 && <EmptyRow text="No revenue posted." />}
              {pnl.revenues.map(rev => (
                <div key={rev.accountCode} className="flex justify-between gap-3 py-2.5">
                  <span className="text-slate-300 font-medium min-w-0 break-words">{rev.accountName} ({rev.accountCode})</span>
                  <span className="font-mono font-bold text-slate-100 shrink-0">{formatCurrency(rev.amount, currency)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-2.5 font-bold text-sm text-brand-500 bg-brand-100/50 px-3 rounded-xl mt-1">
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
                <div key={cost.category} className="flex justify-between gap-3 py-2.5">
                  <span className="text-slate-300 font-medium min-w-0 break-words">{cost.category}</span>
                  <span className="font-mono font-semibold text-rose-600">({formatCurrency(cost.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-2.5 font-bold text-sm text-rose-600 bg-rose-50 px-3 rounded-xl mt-1">
                <span>Total Direct Operating Costs</span>
                <span>({formatCurrency(pnl.totalDirectCosts, currency)})</span>
              </div>
            </div>
          </div>

          {/* GROSS PROFIT SUB-TOTAL */}
          <div className="flex justify-between gap-3 py-3.5 px-5 bg-brand-100 border border-brand-200 rounded-2xl font-bold text-base text-brand-600">
            <span>GROSS PROFIT (Revenue - Direct Costs)</span>
            <span className="font-extrabold text-brand-500 font-mono">{formatCurrency(pnl.grossProfit, currency)} ({pnl.grossProfitMarginPercentage}%)</span>
          </div>

          {/* 3. OPERATING OVERHEADS & DEPRECIATION */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-warning uppercase tracking-wider">3. Operating Expenses & Depreciation</h3>
            <div className="divide-y divide-slate-700/80 text-xs">
              {pnl.operatingExpenses.length === 0 && <EmptyRow text="No operating expenses posted." />}
              {pnl.operatingExpenses.map(opex => (
                <div key={opex.accountCode} className="flex justify-between gap-3 py-2.5">
                  <span className="text-slate-300 font-medium min-w-0 break-words">{opex.accountName} ({opex.accountCode})</span>
                  <span className="font-mono text-slate-300">({formatCurrency(opex.amount, currency)})</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-2.5">
                <span className="text-slate-300 font-medium min-w-0 break-words">Depreciation (accounts in the Depreciation subcategory)</span>
                <span className="font-mono text-brand-500 font-semibold">({formatCurrency(pnl.depreciationExpense, currency)})</span>
              </div>
              <div className="flex justify-between gap-3 py-2.5 font-bold text-sm text-warning bg-amber-50 px-3 rounded-xl mt-1">
                <span>Total Operating Expenses & Depreciation</span>
                <span>({formatCurrency(pnl.totalOperatingExpenses + pnl.depreciationExpense, currency)})</span>
              </div>
            </div>
          </div>

          {/* NET PROFIT GRAND TOTAL */}
          <div className="flex justify-between gap-3 py-4 px-6 bg-brand-500 text-white rounded-2xl shadow-card font-extrabold text-lg">
            <span>NET PROFIT FOR THE PERIOD</span>
            <span className="font-mono">{formatCurrency(pnl.netProfit, currency)} ({pnl.netProfitMarginPercentage}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Finance costs are included in operating expenses; EBITDA {formatCurrency(pnl.ebitda, currency)} is before depreciation only.
          </p>
        </div>
      </Card>
      </>)}
    </div>
  );
};
