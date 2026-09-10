import React, { useState } from 'react';
import { Scale, Download, Printer, CheckCircle2, AlertTriangle, Calendar, Filter, Building2, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const TrialBalancePage: React.FC = () => {
  const { getTrialBalance, currency, selectedCompany, companies, selectedCompanyId } = useFleet();
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const tbData = getTrialBalance(asOfDate);

  const filteredRows = tbData.rows.filter(r => {
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    return true;
  });

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
        tbData.totalOpeningDebit.toFixed(3),
        tbData.totalOpeningCredit.toFixed(3),
        tbData.totalPeriodDebit.toFixed(3),
        tbData.totalPeriodCredit.toFixed(3),
        tbData.totalClosingDebit.toFixed(3),
        tbData.totalClosingCredit.toFixed(3),
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
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-indigo-400" />
            <span>Audited Trial Balance Statement</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time double-entry trial balance verifying mathematical debit/credit equilibrium across opening, movements, and closing positions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} leftIcon={<Download className="w-4 h-4" />}>
            Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrint} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Closing Debits"
          value={formatCurrency(tbData.totalClosingDebit, currency)}
          subValue={`Period Movements: ${formatCurrency(tbData.totalPeriodDebit, currency)}`}
          icon={<Scale className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Total Closing Credits"
          value={formatCurrency(tbData.totalClosingCredit, currency)}
          subValue={`Period Movements: ${formatCurrency(tbData.totalPeriodCredit, currency)}`}
          icon={<Scale className="w-4 h-4" />}
          variant="blue"
        />
        <StatCard
          title="Equilibrium Status"
          value={tbData.isBalanced ? 'Balanced' : 'Out of Balance'}
          subValue={tbData.isBalanced ? '∑(Debits) === ∑(Credits)' : `Variance: ${tbData.difference.toFixed(3)} ${currency}`}
          icon={tbData.isBalanced ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
          variant={tbData.isBalanced ? 'emerald' : 'rose'}
        />
        <StatCard
          title="Accounts Audited"
          value={tbData.rows.length}
          subValue="Active Chart of Accounts"
          icon={<Building2 className="w-4 h-4" />}
          variant="purple"
        />
      </div>

      {/* Balance Verification Banner */}
      {tbData.isBalanced ? (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-200">General Ledger Books in Perfect Balance</p>
              <p className="text-[11px] text-emerald-400/80">
                Total audited debits match total credits at {formatCurrency(tbData.totalClosingDebit, currency)} with zero discrepancy.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
            Variance: 0.000 {currency}
          </span>
        </div>
      ) : (
        <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-rose-200">Audit Discrepancy Detected</p>
              <p className="text-[11px] text-rose-400/80">
                Closing Debits differ from Closing Credits by {tbData.difference.toFixed(3)} {currency}. Please review draft journal entries.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-rose-900/60 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold">
            Variance: {tbData.difference.toFixed(3)} {currency}
          </span>
        </div>
      )}

      {/* Filter and Date Selection Toolbar */}
      <Card className="p-4 bg-slate-900/70 border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-300 font-medium">As of Date:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
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
            <span className="font-semibold text-slate-200">
              {selectedCompany ? selectedCompany.name : 'All Consolidated Group Companies'}
            </span>
          </div>
        </div>
      </Card>

      {/* Trial Balance Statement Table */}
      <Card className="overflow-hidden border border-slate-800 shadow-xl">
        <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
              Trial Balance Statement as of {formatDate(asOfDate)}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">All monetary figures in {currency} (3 Decimal Places)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Account Code</th>
                <th className="py-3 px-4 font-semibold">Account Description</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold text-right border-l border-slate-800/60 bg-slate-900/40">Opening Dr</th>
                <th className="py-3 px-4 font-semibold text-right bg-slate-900/40">Opening Cr</th>
                <th className="py-3 px-4 font-semibold text-right border-l border-slate-800/60 bg-slate-950/40">Period Dr</th>
                <th className="py-3 px-4 font-semibold text-right bg-slate-950/40">Period Cr</th>
                <th className="py-3 px-4 font-semibold text-right border-l border-slate-800/60 bg-indigo-950/30 text-indigo-300">Closing Dr</th>
                <th className="py-3 px-4 font-semibold text-right bg-indigo-950/30 text-indigo-300">Closing Cr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRows.map(row => (
                <tr key={row.accountCode} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-bold text-slate-200">{row.accountCode}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-200">
                    {row.accountName}
                    <span className="block text-[10px] text-slate-500">{row.subcategory}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        row.category === 'Asset'
                          ? 'bg-blue-950/60 text-blue-300 border border-blue-800/50'
                          : row.category === 'Liability'
                          ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50'
                          : row.category === 'Equity'
                          ? 'bg-purple-950/60 text-purple-300 border border-purple-800/50'
                          : row.category === 'Revenue'
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                          : 'bg-rose-950/60 text-rose-300 border border-rose-800/50'
                      }`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono border-l border-slate-800/60 bg-slate-900/20 text-slate-300">
                    {row.openingDebit > 0 ? formatCurrency(row.openingDebit, currency) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono bg-slate-900/20 text-slate-300">
                    {row.openingCredit > 0 ? formatCurrency(row.openingCredit, currency) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono border-l border-slate-800/60 bg-slate-950/20 text-slate-300">
                    {row.periodDebit > 0 ? formatCurrency(row.periodDebit, currency) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono bg-slate-950/20 text-slate-300">
                    {row.periodCredit > 0 ? formatCurrency(row.periodCredit, currency) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold border-l border-slate-800/60 bg-indigo-950/20 text-emerald-400">
                    {row.closingDebit > 0 ? formatCurrency(row.closingDebit, currency) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold bg-indigo-950/20 text-indigo-300">
                    {row.closingCredit > 0 ? formatCurrency(row.closingCredit, currency) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-slate-100 text-xs">
                <td colSpan={3} className="py-3 px-4 uppercase tracking-wider text-right font-mono">
                  Audited Totals:
                </td>
                <td className="py-3 px-4 text-right font-mono border-l border-slate-800 text-slate-300">
                  {formatCurrency(tbData.totalOpeningDebit, currency)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-300">
                  {formatCurrency(tbData.totalOpeningCredit, currency)}
                </td>
                <td className="py-3 px-4 text-right font-mono border-l border-slate-800 text-slate-300">
                  {formatCurrency(tbData.totalPeriodDebit, currency)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-300">
                  {formatCurrency(tbData.totalPeriodCredit, currency)}
                </td>
                <td className="py-3 px-4 text-right font-mono border-l border-slate-800 text-emerald-400 bg-indigo-950/40 text-sm">
                  {formatCurrency(tbData.totalClosingDebit, currency)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-indigo-300 bg-indigo-950/40 text-sm">
                  {formatCurrency(tbData.totalClosingCredit, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};
