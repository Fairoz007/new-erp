import React, { useState } from 'react';
import { Scale, Download, Printer, CheckCircle2, AlertTriangle, Calendar, Filter, Building2, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { getTrialBalance } from '../../services/accounting';

export const TrialBalancePage: React.FC = () => {
  const { chartOfAccounts, journalEntries, currency, selectedCompany, selectedCompanyId } = useFleet();
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const tbData = getTrialBalance(chartOfAccounts, journalEntries, asOfDate, selectedCompanyId);
  // An empty ledger is trivially balanced; show that truthfully instead of a "perfect balance" banner.
  const hasLedger = tbData.rows.some(r => r.closingDebit !== 0 || r.closingCredit !== 0);

  const filteredRows = tbData.rows.filter(r => {
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    return true;
  });

  const sumRows = (k: 'openingDebit' | 'openingCredit' | 'periodDebit' | 'periodCredit' | 'closingDebit' | 'closingCredit') =>
    Math.round(filteredRows.reduce((t, r) => t + r[k], 0) * 1000) / 1000;
  const shown = filterCategory === 'all' ? tbData : {
    totalOpeningDebit: sumRows('openingDebit'), totalOpeningCredit: sumRows('openingCredit'),
    totalPeriodDebit: sumRows('periodDebit'), totalPeriodCredit: sumRows('periodCredit'),
    totalClosingDebit: sumRows('closingDebit'), totalClosingCredit: sumRows('closingCredit'),
  };

  const exportCSV = () => {
    const headers = ['Account Code', 'Account Name', 'Category', 'Opening Debit', 'Opening Credit', 'Period Debit', 'Period Credit', 'Closing Debit', 'Closing Credit'];
    const csvRows = [
      headers.join(','),
      ...filteredRows.map(r =>
        [
          `"${r.accountCode}"`,
          `"${r.accountName.replace(/"/g, '""')}"`,
          `"${r.category}"`,
          r.openingDebit.toFixed(3),
          r.openingCredit.toFixed(3),
          r.periodDebit.toFixed(3),
          r.periodCredit.toFixed(3),
          r.closingDebit.toFixed(3),
          r.closingCredit.toFixed(3),
        ].join(',')
      ),
      [
        '"TOTAL"',
        '""',
        '""',
        shown.totalOpeningDebit.toFixed(3),
        shown.totalOpeningCredit.toFixed(3),
        shown.totalPeriodDebit.toFixed(3),
        shown.totalPeriodCredit.toFixed(3),
        shown.totalClosingDebit.toFixed(3),
        shown.totalClosingCredit.toFixed(3),
      ].join(','),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Trial_Balance_${asOfDate}.csv`;
    link.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Trial Balance Statement
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Opening = account opening balances; movements = posted journal lines dated on or before the as-of date; closing = opening + movements.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button variant="secondary" size="md" onClick={exportCSV} leftIcon={<Download className="w-4 h-4" />}>
            Export CSV
          </Button>
          <Button variant="primary" size="md" onClick={handlePrint} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Closing Debits"
          value={formatCurrency(tbData.totalClosingDebit, currency)}
          subValue={`Movements: ${formatCurrency(tbData.totalPeriodDebit, currency)}`}
          isHero={true}
        />
        <StatCard
          title="Total Closing Credits"
          value={formatCurrency(tbData.totalClosingCredit, currency)}
          subValue={`Movements: ${formatCurrency(tbData.totalPeriodCredit, currency)}`}
        />
        <StatCard
          title="Equilibrium Status"
          value={tbData.isBalanced ? 'Balanced' : 'Discrepancy'}
          subValue={tbData.isBalanced ? '∑(Debits) === ∑(Credits)' : `Variance: ${tbData.difference.toFixed(3)} ${currency}`}
        />
        <StatCard
          title="Accounts Listed"
          value={tbData.rows.length}
          subValue={selectedCompanyId === 'all' ? 'Summed by code across companies' : 'Company chart of accounts'}
        />
      </div>

      {/* Balance Verification Banner */}
      {!hasLedger ? (
        <div className="p-4 bg-slate-850 border border-slate-700 rounded-2xl text-xs text-slate-400">
          No opening balances or posted journal entries exist up to {formatDate(asOfDate)}. The trial balance is empty.
        </div>
      ) : tbData.isBalanced ? (
        <div className="p-4 bg-[#DCEFE5] border border-[#BDE2D0] rounded-2xl flex items-center justify-between text-[#06452F]">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#086343] shrink-0" />
            <div>
              <p className="text-xs font-bold text-[#06452F]">Debits equal credits</p>
              <p className="text-[11px] text-[#086343] mt-0.5">
                Total closing debits match total closing credits at {formatCurrency(tbData.totalClosingDebit, currency)} with zero discrepancy.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-white border border-[#BDE2D0] text-[#086343] text-xs font-mono font-bold shadow-2xs">
            Variance: 0.000 {currency}
          </span>
        </div>
      ) : (
        <div className="p-4 bg-[#FEECEC] border border-[#FECACA] rounded-2xl flex items-center justify-between text-[#991B1B]">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-[#991B1B]">Audit Discrepancy Detected</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Closing Debits differ from Closing Credits by {tbData.difference.toFixed(3)} {currency}. Check account opening balances.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-white border border-[#FECACA] text-rose-700 text-xs font-mono font-bold shadow-2xs">
            Variance: {tbData.difference.toFixed(3)} {currency}
          </span>
        </div>
      )}

      {/* Filter and Date Selection Toolbar */}
      <Card className="p-5 bg-white border border-slate-700 shadow-card rounded-[20px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 font-semibold">As of Date:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="Asset">Assets</option>
                <option value="Liability">Liabilities</option>
                <option value="Equity">Equity</option>
                <option value="Revenue">Revenue</option>
                <option value="Expense">Expenses</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Reporting Entity:{' '}
            <span className="font-bold text-slate-100">
              {selectedCompany ? selectedCompany.name : 'All Consolidated Group Companies'}
            </span>
          </div>
        </div>
      </Card>

      {/* Trial Balance Statement Table */}
      <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
        <div className="p-5 border-b border-slate-700 bg-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Trial Balance Statement as of {formatDate(asOfDate)}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">All monetary figures in {currency} (3 Decimal Places)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-850 border-b border-slate-700 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Account Code</th>
                <th className="py-3.5 px-4">Account Description</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-right border-l border-slate-700/80 bg-slate-850/60">Opening Dr</th>
                <th className="py-3.5 px-4 text-right bg-slate-850/60">Opening Cr</th>
                <th className="py-3.5 px-4 text-right border-l border-slate-700/80 bg-slate-850/80">Period Dr</th>
                <th className="py-3.5 px-4 text-right bg-slate-850/80">Period Cr</th>
                <th className="py-3.5 px-4 text-right border-l border-slate-700/80 bg-[#DCEFE5]/30 text-[#086343] font-bold">Closing Dr</th>
                <th className="py-3.5 px-4 text-right bg-[#DCEFE5]/30 text-[#086343] font-bold">Closing Cr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/80 bg-white">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 italic">No accounts to show.</td>
                </tr>
              )}
              {filteredRows.map(row => (
                <tr key={row.accountCode} className="hover:bg-slate-850/60 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-100">{row.accountCode}</td>
                  <td className="py-3 px-4 font-semibold text-slate-200">
                    {row.accountName}
                    <span className="block text-[10px] text-slate-400 font-normal">{row.subcategory}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        row.category === 'Asset'
                          ? 'bg-[#DBEAFE] text-[#1E40AF]'
                          : row.category === 'Liability'
                          ? 'bg-[#FEF3C7] text-[#92400E]'
                          : row.category === 'Equity'
                          ? 'bg-[#F3E8FF] text-[#6B21A8]'
                          : row.category === 'Revenue'
                          ? 'bg-[#DCEFE5] text-[#06452F]'
                          : 'bg-[#FFE4E6] text-[#9F1239]'
                      }`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono border-l border-slate-700/80 text-slate-300">
                    {row.openingDebit > 0 ? formatCurrency(row.openingDebit, currency) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {row.openingCredit > 0 ? formatCurrency(row.openingCredit, currency) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono border-l border-slate-700/80 text-slate-300">
                    {row.periodDebit > 0 ? formatCurrency(row.periodDebit, currency) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {row.periodCredit > 0 ? formatCurrency(row.periodCredit, currency) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold border-l border-slate-700/80 text-[#086343]">
                    {row.closingDebit > 0 ? formatCurrency(row.closingDebit, currency) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#086343]">
                    {row.closingCredit > 0 ? formatCurrency(row.closingCredit, currency) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-850 font-bold border-t-2 border-slate-700 text-slate-100 text-xs">
                <td colSpan={3} className="py-3.5 px-4 uppercase tracking-wider text-right font-mono">
                  Totals:
                </td>
                <td className="py-3.5 px-4 text-right font-mono border-l border-slate-700 text-slate-300">
                  {formatCurrency(shown.totalOpeningDebit, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                  {formatCurrency(shown.totalOpeningCredit, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono border-l border-slate-700 text-slate-300">
                  {formatCurrency(shown.totalPeriodDebit, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                  {formatCurrency(shown.totalPeriodCredit, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono border-l border-slate-700 text-[#086343] bg-[#DCEFE5]/40 text-sm font-extrabold">
                  {formatCurrency(shown.totalClosingDebit, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-[#086343] bg-[#DCEFE5]/40 text-sm font-extrabold">
                  {formatCurrency(shown.totalClosingCredit, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};
