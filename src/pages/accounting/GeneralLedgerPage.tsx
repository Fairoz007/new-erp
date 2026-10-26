import React, { useEffect, useState } from 'react';
import { BookOpen, Calendar, Download, Printer, Filter, Building2, Search, ArrowRight, UserCheck, Truck, Layers, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import { consolidateAccounts, getGeneralLedger } from '../../services/accounting';

export const GeneralLedgerPage: React.FC = () => {
  const { chartOfAccounts, journalEntries, suppliers, customers, getPartyLedger, currency, selectedCompany, selectedCompanyId } = useFleet();
  const accountOptions = consolidateAccounts(chartOfAccounts, selectedCompanyId);
  const { ledgerFocus, openLedgerFor } = useUI();
  const [accountSearch, setAccountSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'gl' | 'party'>('gl');
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('all');
  const [partyType, setPartyType] = useState<'Supplier' | 'Customer'>('Supplier');
  const [selectedPartyId, setSelectedPartyId] = useState<string>(suppliers[0]?.id || '');
  const [startDate, setStartDate] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState<string>(localToday());

  // Arriving from a Trial Balance row: focus that account over the whole year
  useEffect(() => {
    if (!ledgerFocus) return;
    setSelectedAccountCode(ledgerFocus);
    setActiveTab('gl');
    openLedgerFor(null);
  }, [ledgerFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectivePartyId = selectedPartyId || (partyType === 'Supplier' ? suppliers : customers)[0]?.id || '';
  const glData = getGeneralLedger(chartOfAccounts, journalEntries, selectedAccountCode, startDate, endDate, selectedCompanyId, currency);
  const partyLedger = getPartyLedger(effectivePartyId, partyType);

  const selectedParty = partyType === 'Supplier'
    ? suppliers.find(s => s.id === effectivePartyId)
    : customers.find(c => c.id === effectivePartyId);

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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            General Ledger & Sub-Ledgers
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Granular transaction journals, opening/closing balances, vehicle cost allocations, and counterparty statement of accounts.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button variant="secondary" size="md" onClick={exportGLCSV} leftIcon={<Download className="w-4 h-4" />}>
            Export Ledger
          </Button>
          <Button variant="primary" size="md" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
            Print Statement
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 bg-slate-850 border border-slate-700 rounded-full w-fit">
        <button
          onClick={() => setActiveTab('gl')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'gl'
              ? 'bg-white text-slate-100 shadow-2xs'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Chart of Accounts General Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('party')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'party'
              ? 'bg-white text-slate-100 shadow-2xs'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Supplier & Customer Sub-Ledgers (SOA)</span>
        </button>
      </div>

      {activeTab === 'gl' ? (
        <>
          {/* General Ledger KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard
              title="Total Period Debits"
              value={formatCurrency(totalDebits, currency)}
              subValue="Posted voucher entries"
              isHero={true}
            />
            <StatCard
              title="Total Period Credits"
              value={formatCurrency(totalCredits, currency)}
              subValue="Posted voucher entries"
            />
            <StatCard
              title="Ledger Entries"
              value={totalTransactions}
              subValue="Transactions in range"
            />
            <StatCard
              title="Accounts Displayed"
              value={glData.length}
              subValue={`Out of ${accountOptions.length} accounts`}
            />
          </div>

          {/* GL Filters */}
          <Card className="p-5 bg-white border border-slate-700 shadow-card rounded-[20px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Target Account</label>
                  <input
                    type="search"
                    value={accountSearch}
                    onChange={e => setAccountSearch(e.target.value)}
                    placeholder="Search code or name..."
                    aria-label="Search accounts"
                    className="mb-1.5 w-full bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#086343]"
                  />
                  <select
                    value={selectedAccountCode}
                    onChange={e => setSelectedAccountCode(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer min-w-[280px]"
                  >
                    <option value="all">-- All Chart of Accounts (Consolidated) --</option>
                    {accountOptions.filter(acc => acc.code === selectedAccountCode || !accountSearch.trim() || `${acc.code} ${acc.name}`.toLowerCase().includes(accountSearch.trim().toLowerCase())).map(acc => (
                      <option key={acc.code} value={acc.code}>
                        {acc.code} - {acc.name} ({acc.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343]"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-400">
                Entity: <span className="font-bold text-slate-100">{selectedCompany ? selectedCompany.name : 'Group Consolidated'}</span>
              </div>
            </div>
          </Card>

          {/* Accounts General Ledger Tables */}
          <div className="space-y-6">
            {glData.length === 0 && (
              <Card className="p-8 text-center text-sm text-slate-400 bg-white border border-slate-700 rounded-[20px]">
                No chart of accounts is set up for this selection yet, so there is no ledger to show.
              </Card>
            )}
            {glData.map(acc => (
              <Card key={acc.accountCode} className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
                {/* Account Ledger Header */}
                <div className="p-5 border-b border-slate-700 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-sm text-[#086343] px-2.5 py-0.5 rounded-full bg-[#DCEFE5]">
                        {acc.accountCode}
                      </span>
                      <h3 className="text-base font-bold text-slate-100">{acc.accountName}</h3>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">({acc.category})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs font-mono">
                    <div>
                      <span className="text-slate-400 font-sans">Opening Balance: </span>
                      <span className="font-bold text-slate-100">{formatCurrency(acc.openingBalance, currency)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-sans">Closing Balance: </span>
                      <span className="font-extrabold text-[#086343]">{formatCurrency(acc.closingBalance, currency)}</span>
                    </div>
                  </div>
                </div>

                {/* Ledger Transactions Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-850 border-b border-slate-700 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                        <th className="py-3.5 px-4">Date</th>
                        <th className="py-3.5 px-4">JE Number</th>
                        <th className="py-3.5 px-4">Reference</th>
                        <th className="py-3.5 px-4">Description</th>
                        <th className="py-3.5 px-4">Vehicle</th>
                        <th className="py-3.5 px-4 text-right text-[#086343]">Debit</th>
                        <th className="py-3.5 px-4 text-right text-slate-400">Credit</th>
                        <th className="py-3.5 px-4 text-right font-mono">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/80 bg-white">
                      {acc.lines.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                            No ledger movements recorded for this account in the specified period.
                          </td>
                        </tr>
                      ) : (
                        acc.lines.map(line => (
                          <tr key={line.id} className="hover:bg-slate-850/60 transition-colors">
                            <td className="py-3 px-4 text-slate-300 font-mono font-medium">{formatDate(line.date)}</td>
                            <td className="py-3 px-4 font-mono font-bold text-[#086343]">{line.entryNumber}</td>
                            <td className="py-3 px-4 font-mono text-slate-400">{line.reference || '-'}</td>
                            <td className="py-3 px-4 text-slate-200 font-medium">{line.description}</td>
                            <td className="py-3 px-4">
                              {line.vehiclePlate ? (
                                <span className="px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700 font-mono text-[10px] text-[#086343] font-bold">
                                  {line.vehiclePlate}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-[#086343]">
                              {line.debit > 0 ? formatCurrency(line.debit, currency) : '-'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-400">
                              {line.credit > 0 ? formatCurrency(line.credit, currency) : '-'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-100">
                              {formatCurrency(line.runningBalance, currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-850 border-t border-slate-700 font-bold text-slate-100 text-xs">
                        <td colSpan={5} className="py-3 px-4 text-right uppercase tracking-wider font-mono">
                          Account Activity Totals:
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#086343] font-bold">
                          {formatCurrency(acc.totalDebit, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400 font-bold">
                          {formatCurrency(acc.totalCredit, currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-[#086343]">
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
          <Card className="p-5 bg-white border border-slate-700 shadow-card rounded-[20px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Party Category</label>
                  <select
                    value={partyType}
                    onChange={e => {
                      const type = e.target.value as any;
                      setPartyType(type);
                      setSelectedPartyId(type === 'Supplier' ? suppliers[0]?.id || '' : customers[0]?.id || '');
                    }}
                    className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
                  >
                    <option value="Supplier">Suppliers / Vendors (AP Sub-Ledger)</option>
                    <option value="Customer">Customers / Clients (AR Sub-Ledger)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Select Account Name</label>
                  <select
                    value={effectivePartyId}
                    onChange={e => setSelectedPartyId(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer min-w-[280px]"
                  >
                    {partyType === 'Supplier'
                      ? suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.vatNumber || s.taxNumber || 'Tax Reg OK'})</option>)
                      : customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customerType})</option>)
                    }
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* Statement of Account Card */}
          <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
            <div className="p-5 border-b border-slate-700 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {partyType === 'Supplier' ? 'Accounts Payable (AP) Statement' : 'Accounts Receivable (AR) Statement'}
                </span>
                <h3 className="text-lg font-extrabold text-slate-100 mt-0.5">{selectedParty?.name}</h3>
                <p className="text-xs text-slate-400 font-medium">Payment Terms: {selectedParty?.paymentTermsDays || 30} Days • Currency: {currency}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700 text-right">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Net Outstanding Balance</p>
                <p className={`text-lg font-extrabold font-mono mt-0.5 ${partyLedger.closingBalance > 0 ? 'text-[#D9A441]' : 'text-[#086343]'}`}>
                  {formatCurrency(partyLedger.closingBalance, currency)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 border-b border-slate-700 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Transaction / Voucher</th>
                    <th className="py-3.5 px-4">Description</th>
                    <th className="py-3.5 px-4 text-right text-rose-600">Invoiced / Billed</th>
                    <th className="py-3.5 px-4 text-right text-[#086343]">Paid / Remitted</th>
                    <th className="py-3.5 px-4 text-right font-mono">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80 bg-white">
                  {partyLedger.lines.map(line => (
                    <tr key={line.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3 px-4 text-slate-300 font-mono font-medium">{formatDate(line.date)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[#086343]">{line.referenceNumber}</td>
                      <td className="py-3 px-4 text-slate-200 font-medium">{line.description}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                        {line.debit > 0 ? formatCurrency(line.debit, currency) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#086343]">
                        {line.credit > 0 ? formatCurrency(line.credit, currency) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-100">
                        {formatCurrency(line.runningBalance, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
