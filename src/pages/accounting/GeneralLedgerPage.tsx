import React, { useState } from 'react';
import { BookOpen, Calendar, Download, Printer, Filter, Building2, Search, ArrowRight, UserCheck, Truck, Layers, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const GeneralLedgerPage: React.FC = () => {
  const { chartOfAccounts, suppliers, customers, getGeneralLedger, getPartyLedger, currency, selectedCompany } = useFleet();
  const { openQuickModal } = useUI();
  const [activeTab, setActiveTab] = useState<'gl' | 'party'>('gl');
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('all');
  const [partyType, setPartyType] = useState<'Supplier' | 'Customer'>('Supplier');
  const [selectedPartyId, setSelectedPartyId] = useState<string>(suppliers[0]?.id || 'sup-1');
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const glData = getGeneralLedger(selectedAccountCode, startDate, endDate);
  const partyLedger = getPartyLedger(selectedPartyId, partyType);

  const selectedParty = partyType === 'Supplier'
    ? suppliers.find(s => s.id === selectedPartyId)
    : customers.find(c => c.id === selectedPartyId);

  const totalDebits = glData.reduce((s, a) => s + a.totalDebit, 0);
  const totalCredits = glData.reduce((s, a) => s + a.totalCredit, 0);
  const totalTransactions = glData.reduce((s, a) => s + a.lines.length, 0);

  const exportGLCSV = () => {
    const headers = ['Account Code', 'Account Name', 'Date', 'JE #', 'Reference', 'Description', 'Vehicle Plate', 'Debit', 'Credit', 'Running Balance'];
    const rows: string[] = [headers.join(',')];

    glData.forEach(acc => {
      acc.lines.forEach(line => {
        rows.push(
          [
            `"${acc.accountCode}"`,
            `"${acc.accountName.replace(/"/g, '""')}"`,
            `"${line.date}"`,
            `"${line.entryNumber}"`,
            `"${line.reference || ''}"`,
            `"${line.description.replace(/"/g, '""')}"`,
            `"${line.vehiclePlate || ''}"`,
            line.debit.toFixed(3),
            line.credit.toFixed(3),
            line.runningBalance.toFixed(3),
          ].join(',')
        );
      });
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `General_Ledger_${startDate}_to_${endDate}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            <span>General Ledger & Party Sub-Ledgers</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Chronological audit trail with continuous running balances, cost center drilldown, and supplier/customer statement of accounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportGLCSV} leftIcon={<Download className="w-4 h-4" />}>
            Export GL CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('gl')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'gl'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Chart of Accounts General Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('party')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'party'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Supplier & Customer Sub-Ledgers (SOA)</span>
        </button>
      </div>

      {activeTab === 'gl' ? (
        <>
          {/* General Ledger KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <StatCard
              title="Total Period Debits"
              value={formatCurrency(totalDebits, currency)}
              subValue="Posted voucher entries"
              icon={<BookOpen className="w-4 h-4" />}
              variant="indigo"
            />
            <StatCard
              title="Total Period Credits"
              value={formatCurrency(totalCredits, currency)}
              subValue="Posted voucher entries"
              icon={<BookOpen className="w-4 h-4" />}
              variant="blue"
            />
            <StatCard
              title="Ledger Entries"
              value={totalTransactions}
              subValue="Transactions in range"
              icon={<Layers className="w-4 h-4" />}
              variant="emerald"
            />
            <StatCard
              title="Accounts Displayed"
              value={glData.length}
              subValue={`Out of ${chartOfAccounts.length} accounts`}
              icon={<Building2 className="w-4 h-4" />}
              variant="purple"
            />
          </div>

          {/* GL Filters */}
          <Card className="p-4 bg-slate-900/70 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Account</label>
                  <select
                    value={selectedAccountCode}
                    onChange={e => setSelectedAccountCode(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer min-w-[280px]"
                  >
                    <option value="all">-- All Chart of Accounts (Consolidated) --</option>
                    {chartOfAccounts.map(acc => (
                      <option key={acc.code} value={acc.code}>
                        {acc.code} - {acc.name} ({acc.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date Range (From - To)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-slate-500 text-xs">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                Reporting Entity:{' '}
                <span className="font-semibold text-slate-200">
                  {selectedCompany ? selectedCompany.name : 'Group Operations Consolidated'}
                </span>
              </div>
            </div>
          </Card>

          {/* GL Accounts List & Line Items */}
          <div className="space-y-6">
            {glData.map(acc => (
              <Card key={acc.accountCode} className="overflow-hidden border border-slate-800 shadow-xl">
                {/* Account Banner */}
                <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded bg-indigo-950 border border-indigo-500/40 text-indigo-300 font-mono font-bold text-sm">
                      {acc.accountCode}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{acc.accountName}</h3>
                      <p className="text-[11px] text-slate-400">
                        Category: <span className="text-slate-300">{acc.category}</span> • Subcategory: <span className="text-slate-300">{acc.subcategory}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Opening Balance</span>
                      <span className="font-mono font-semibold text-slate-300">{formatCurrency(acc.openingBalance, currency)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Closing Balance</span>
                      <span className={`font-mono font-bold text-sm ${acc.closingBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(acc.closingBalance, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ledger Lines Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-4 font-semibold">Date</th>
                        <th className="py-2.5 px-4 font-semibold">JE Number</th>
                        <th className="py-2.5 px-4 font-semibold">Reference</th>
                        <th className="py-2.5 px-4 font-semibold">Description</th>
                        <th className="py-2.5 px-4 font-semibold">Vehicle</th>
                        <th className="py-2.5 px-4 font-semibold text-right text-emerald-400 bg-slate-900/30">Debit</th>
                        <th className="py-2.5 px-4 font-semibold text-right text-indigo-300 bg-slate-900/30">Credit</th>
                        <th className="py-2.5 px-4 font-semibold text-right bg-slate-950 font-mono">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {acc.lines.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-500 italic">
                            No ledger movements recorded for this account in the specified period.
                          </td>
                        </tr>
                      ) : (
                        acc.lines.map(line => (
                          <tr key={line.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2 px-4 text-slate-300 font-mono">{formatDate(line.date)}</td>
                            <td className="py-2 px-4 font-mono font-bold text-indigo-400">{line.entryNumber}</td>
                            <td className="py-2 px-4 font-mono text-slate-400">{line.reference || '-'}</td>
                            <td className="py-2 px-4 text-slate-200">{line.description}</td>
                            <td className="py-2 px-4">
                              {line.vehiclePlate ? (
                                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[10px] text-indigo-300">
                                  {line.vehiclePlate}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-emerald-400 bg-slate-900/10">
                              {line.debit > 0 ? formatCurrency(line.debit, currency) : '-'}
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-indigo-300 bg-slate-900/10">
                              {line.credit > 0 ? formatCurrency(line.credit, currency) : '-'}
                            </td>
                            <td className="py-2 px-4 text-right font-mono font-bold text-slate-100">
                              {formatCurrency(line.runningBalance, currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-950/80 border-t border-slate-800 font-semibold text-slate-300 text-xs">
                        <td colSpan={5} className="py-2.5 px-4 text-right uppercase tracking-wider font-mono">
                          Account Activity Totals:
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-400">
                          {formatCurrency(acc.totalDebit, currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-indigo-300">
                          {formatCurrency(acc.totalCredit, currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatCurrency(acc.closingBalance, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        /* Party Sub-Ledger Statement of Account (SOA) */
        <div className="space-y-6">
          <Card className="p-4 bg-slate-900/70 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Party Category</label>
                  <select
                    value={partyType}
                    onChange={e => {
                      const type = e.target.value as any;
                      setPartyType(type);
                      setSelectedPartyId(type === 'Supplier' ? suppliers[0]?.id || '' : customers[0]?.id || '');
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="Supplier">Suppliers / Vendors (AP Sub-Ledger)</option>
                    <option value="Customer">Customers / Clients (AR Sub-Ledger)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Select Entity</label>
                  <select
                    value={selectedPartyId}
                    onChange={e => setSelectedPartyId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer min-w-[280px]"
                  >
                    {partyType === 'Supplier'
                      ? suppliers.map(s => <option key={s.id} value={s.id}>{s.name} (Balance: {formatCurrency(s.currentBalance, currency)})</option>)
                      : customers.map(c => <option key={c.id} value={c.id}>{c.name} (Balance: {formatCurrency(c.currentBalance, currency)})</option>)}
                  </select>
                </div>
              </div>

              {selectedParty && (
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Current Outstanding Balance</span>
                  <span className="text-lg font-bold font-mono text-amber-400">
                    {formatCurrency(selectedParty.currentBalance, currency)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Statement of Account Table */}
          <Card className="overflow-hidden border border-slate-800 shadow-xl">
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Statement of Account: {selectedParty?.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  VAT TRN: {selectedParty?.vatNumber || 'OM11002233'} • Terms: {selectedParty?.paymentTermsDays || 30} Days Credit
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 text-xs font-semibold">
                  {partyType} Statement
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Document Type</th>
                    <th className="py-3 px-4 font-semibold">Ref #</th>
                    <th className="py-3 px-4 font-semibold">Transaction Particulars</th>
                    <th className="py-3 px-4 font-semibold text-right">Debit (Payment/Debit)</th>
                    <th className="py-3 px-4 font-semibold text-right">Credit (Invoice/Billed)</th>
                    <th className="py-3 px-4 font-semibold text-right font-mono bg-slate-900/30">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {partyLedger.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 italic">
                        No transaction history found for {selectedParty?.name}.
                      </td>
                    </tr>
                  ) : (
                    partyLedger.lines.map(line => (
                      <tr key={line.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-4 text-slate-300 font-mono">{formatDate(line.date)}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            line.type === 'Invoice' ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {line.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-200">{line.referenceNumber}</td>
                        <td className="py-2.5 px-4 text-slate-200">{line.description}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-400">
                          {line.debit > 0 ? formatCurrency(line.debit, currency) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-indigo-300">
                          {line.credit > 0 ? formatCurrency(line.credit, currency) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-400 bg-slate-900/20">
                          {formatCurrency(line.runningBalance, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-slate-100 text-xs">
                    <td colSpan={4} className="py-3 px-4 uppercase tracking-wider text-right font-mono">
                      Sub-Ledger Total Balance:
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-400">
                      {formatCurrency(partyLedger.totalDebit, currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-indigo-300">
                      {formatCurrency(partyLedger.totalCredit, currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-400 bg-amber-950/20 text-sm">
                      {formatCurrency(partyLedger.closingBalance, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
