import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Calendar, Download, Printer, Filter, Building2, Search, ArrowRight, UserCheck, Truck, Layers, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import { consolidateAccounts } from '../../services/accounting';
import { useGeneralLedgerSummary, useLedgerLines, fetchLedgerLines, usePartyStatement, type GlAccountSummary } from '../../services/queries-system';
import { FilterInput, FilterSelect } from '../../components/ui/FilterControls';
import { downloadCsv } from '../../utils/export';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';

const PAGE_LINES = 50;

/** Inline loading / error line for the server-backed sections. */
const LoadState: React.FC<{ loading: boolean; error?: Error; onRetry: () => void; colSpan?: number }> = ({ loading, error, onRetry, colSpan }) => {
  const body = error ? (
    <span className="text-rose-600">Could not load: {error.message} <button className="underline font-bold cursor-pointer" onClick={onRetry}>Retry</button></span>
  ) : loading ? <span className="text-slate-400">Loading…</span> : null;
  if (!body) return null;
  return colSpan ? <tr><td colSpan={colSpan} className="py-6 text-center text-xs">{body}</td></tr> : <div className="py-6 text-center text-xs">{body}</div>;
};

/** One account's card: lines load from the database (running balance included) when the card scrolls into view. */
const AccountLedgerCard: React.FC<{ acc: GlAccountSummary; companyId: string | null | undefined; startDate: string; endDate: string; currency: string }> = ({ acc, companyId, startDate, endDate, currency }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');
  const [visible, setVisible] = useState(PAGE_LINES);
  useEffect(() => {
    if (inView || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setInView(true); }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [inView]);
  const shownCount = Math.min(visible, acc.lineCount);
  const lines = useLedgerLines(companyId, acc.accountCode, startDate || undefined, endDate || undefined, shownCount, inView && shownCount > 0);
  const rows = lines.data ?? [];

  return (
              <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
                <div ref={ref} />
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
                      {acc.lineCount === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                            No ledger movements recorded for this account in the specified period.
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <LoadState loading={lines.loading || !inView} error={lines.error} onRetry={() => void lines.refetch()} colSpan={8} />
                      ) : (
                        rows.map(line => (
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
                      {rows.length > 0 && lines.error && (
                        <LoadState loading={false} error={lines.error} onRetry={() => void lines.refetch()} colSpan={8} />
                      )}
                      {rows.length > 0 && acc.lineCount > shownCount && (
                        <tr>
                          <td colSpan={8} className="py-3 px-4 text-center">
                            <button
                              className="text-xs font-bold text-[#086343] underline cursor-pointer disabled:opacity-60"
                              disabled={lines.fetching}
                              onClick={() => setVisible(v => v + 200)}
                            >
                              {lines.fetching ? 'Loading…' : `Show more (${acc.lineCount - shownCount} more lines, totals above include all)`}
                            </button>
                          </td>
                        </tr>
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
  );
};

export const GeneralLedgerPage: React.FC = () => {
  const { chartOfAccounts, suppliers, customers, currency, selectedCompany, selectedCompanyId, isCollectionLoaded } = useFleet();
  const accountOptions = consolidateAccounts(chartOfAccounts, selectedCompanyId);
  const { ledgerFocus, openLedgerFor, addToast } = useUI();
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
  // Totals per account come from one aggregate (general_ledger_summary); each account's lines are
  // paged from general_ledger_page with the running balance computed in the database.
  const summary = useGeneralLedgerSummary(chartOfAccounts, selectedCompanyId, selectedAccountCode, startDate || undefined, endDate || undefined, currency);
  const glData = summary.data ?? [];
  const accountsLoading = !isCollectionLoaded('chartOfAccounts');
  const party = usePartyStatement(activeTab === 'party' ? effectivePartyId : '', partyType,
    partyType === 'Supplier' ? suppliers : customers, selectedCompanyId);
  const partyLedger = party.data ?? { openingBalance: 0, lines: [], totalDebit: 0, totalCredit: 0, closingBalance: 0 };

  const selectedParty = partyType === 'Supplier'
    ? suppliers.find(s => s.id === effectivePartyId)
    : customers.find(c => c.id === effectivePartyId);

  const totalDebits = glData.reduce((s, a) => s + a.totalDebit, 0);
  const totalCredits = glData.reduce((s, a) => s + a.totalCredit, 0);
  const totalTransactions = glData.reduce((s, a) => s + a.lineCount, 0);

  // Export fetches every line of every account in range, ≤1000 per request, with progress.
  const [exportProgress, setExportProgress] = useState<{ loaded: number; total: number } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const exportGLCSV = async () => {
    if (exportProgress) { exportAbort.current?.abort(); return; }
    const ctrl = new AbortController();
    exportAbort.current = ctrl;
    const total = totalTransactions;
    setExportProgress({ loaded: 0, total });
    try {
      const headers = ['Account Code', 'Account Name', 'Date', 'JE #', 'Reference', 'Description', 'Vehicle Plate', 'Debit', 'Credit', 'Running Balance'];
      const rows: unknown[][] = [];
      let done = 0;
      for (const acc of glData) {
        if (acc.lineCount === 0) continue;
        const lines = await fetchLedgerLines(selectedCompanyId, acc.accountCode, startDate || undefined, endDate || undefined, acc.lineCount,
          p => setExportProgress({ loaded: done + p.loaded, total }), ctrl.signal);
        done += lines.length;
        lines.forEach(line => {
          rows.push([acc.accountCode, acc.accountName, line.date, line.entryNumber, line.reference || '', line.description,
            line.vehiclePlate || '', line.debit, line.credit, line.runningBalance]);
        });
      }

      downloadCsv(`General_Ledger_${startDate}_to_${endDate}`, headers, rows, { dated: false });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') addToast({ type: 'error', title: 'Export failed', message: (e as Error).message });
    } finally {
      setExportProgress(null);
      exportAbort.current = null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="General Ledger & Sub-Ledgers"
        description="Granular transaction journals, opening/closing balances, vehicle cost allocations, and counterparty statement of accounts."
        actions={
          <>
            <Button variant="secondary" size="md" onClick={() => void exportGLCSV()} disabled={!exportProgress && (summary.loading || !!summary.error)}
              leftIcon={<Download className="w-4 h-4" />}>
              {exportProgress ? `Cancel export (${exportProgress.loaded.toLocaleString()} / ${exportProgress.total.toLocaleString()})` : 'Export Ledger'}
            </Button>
            <Button variant="primary" size="md" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>
              Print Statement
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        variant="segmented"
        className="w-fit"
        activeTab={activeTab}
        onChange={id => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'gl', label: 'Chart of Accounts General Ledger', icon: <Layers className="w-4 h-4" /> },
          { id: 'party', label: 'Supplier & Customer Sub-Ledgers (SOA)', icon: <UserCheck className="w-4 h-4" /> },
        ]}
      />

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
                  <FilterInput
                    type="search"
                    value={accountSearch}
                    onChange={e => setAccountSearch(e.target.value)}
                    placeholder="Search code or name..."
                    aria-label="Search accounts"
                    className="mb-1.5 w-full"
                  />
                  <FilterSelect
                    value={selectedAccountCode}
                    onChange={e => setSelectedAccountCode(e.target.value)}
                    className="min-w-[280px]"
                  >
                    <option value="all">-- All Chart of Accounts (Consolidated) --</option>
                    {accountOptions.filter(acc => acc.code === selectedAccountCode || !accountSearch.trim() || `${acc.code} ${acc.name}`.toLowerCase().includes(accountSearch.trim().toLowerCase())).map(acc => (
                      <option key={acc.code} value={acc.code}>
                        {acc.code} - {acc.name} ({acc.category})
                      </option>
                    ))}
                  </FilterSelect>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</label>
                  <FilterInput
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</label>
                  <FilterInput
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
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
            {(summary.error || summary.loading || accountsLoading) && !summary.data && (
              <Card className="p-8 text-center text-sm bg-white border border-slate-700 rounded-[20px]">
                <LoadState loading={summary.loading || accountsLoading} error={summary.error} onRetry={() => void summary.refetch()} />
              </Card>
            )}
            {summary.data && !accountsLoading && glData.length === 0 && (
              <Card className="p-8 text-center text-sm text-slate-400 bg-white border border-slate-700 rounded-[20px]">
                No chart of accounts is set up for this selection yet, so there is no ledger to show.
              </Card>
            )}
            {glData.map(acc => (
              <AccountLedgerCard key={`${acc.accountCode}:${selectedCompanyId}:${startDate}:${endDate}`} acc={acc}
                companyId={selectedCompanyId} startDate={startDate} endDate={endDate} currency={currency} />
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
                  <FilterSelect
                    value={partyType}
                    onChange={e => {
                      const type = e.target.value as any;
                      setPartyType(type);
                      setSelectedPartyId(type === 'Supplier' ? suppliers[0]?.id || '' : customers[0]?.id || '');
                    }}
                  >
                    <option value="Supplier">Suppliers / Vendors (AP Sub-Ledger)</option>
                    <option value="Customer">Customers / Clients (AR Sub-Ledger)</option>
                  </FilterSelect>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Select Account Name</label>
                  <FilterSelect
                    value={effectivePartyId}
                    onChange={e => setSelectedPartyId(e.target.value)}
                    className="min-w-[280px]"
                  >
                    {partyType === 'Supplier'
                      ? suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.vatNumber || s.taxNumber || 'Tax Reg OK'})</option>)
                      : customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customerType})</option>)
                    }
                  </FilterSelect>
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
                  {!party.data && <LoadState loading={party.loading} error={party.error} onRetry={() => void party.refetch()} colSpan={6} />}
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
