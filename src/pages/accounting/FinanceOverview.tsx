import React from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Landmark,
  ReceiptText,
  Scale,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { AppPage, useUI } from '../../context/UIContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

const FinanceValue: React.FC<{
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}> = ({ label, value, detail, icon, tone = 'indigo' }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };

  return (
    <div className="group rounded-xl border border-slate-700 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-100 tabular-nums">{value}</p>
          <p className="mt-2 text-xs text-slate-400">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tones[tone]}`}>{icon}</span>
      </div>
    </div>
  );
};

export const FinanceOverview: React.FC = () => {
  const {
    selectedCompanyId,
    selectedCompany,
    currency,
    bankAccounts,
    invoices,
    journalEntries,
    reconciliations,
    approvalRequests,
    getCompanyProfitLoss,
    getCompanyBalanceSheet,
    getTrialBalance,
  } = useFleet();
  const { setCurrentPage } = useUI();

  const companyMatches = (companyId: string) => selectedCompanyId === 'all' || companyId === selectedCompanyId;
  const scopedInvoices = invoices.filter(invoice => companyMatches(invoice.companyId));
  const scopedJournals = journalEntries.filter(entry => companyMatches(entry.companyId));
  const scopedReconciliations = reconciliations.filter(item => companyMatches(item.companyId));
  const scopedApprovals = approvalRequests.filter(item => companyMatches(item.companyId));
  const scopedBankAccounts = bankAccounts.filter(account => companyMatches(account.companyId) && account.active);

  const pnl = getCompanyProfitLoss();
  const balanceSheet = getCompanyBalanceSheet();
  const trialBalance = getTrialBalance(new Date().toISOString().slice(0, 10));
  // An empty ledger is trivially "balanced"; say so instead of claiming the books were checked.
  const hasLedger = trialBalance.rows.some(r => r.closingDebit !== 0 || r.closingCredit !== 0);

  const cashBalance = scopedBankAccounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const receivables = scopedInvoices
    .filter(invoice => invoice.invoiceType === 'Sales' && invoice.paymentStatus !== 'Cancelled')
    .reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const payables = scopedInvoices
    .filter(invoice => invoice.invoiceType === 'Purchase' && invoice.paymentStatus !== 'Cancelled')
    .reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const workingCapital = balanceSheet.assets.totalCurrentAssets - balanceSheet.liabilities.totalCurrentLiabilities;
  const overdueReceivables = scopedInvoices.filter(invoice => invoice.invoiceType === 'Sales' && invoice.paymentStatus === 'Overdue');
  const pendingApprovals = scopedApprovals.filter(approval => approval.status === 'Pending');
  const draftJournals = scopedJournals.filter(entry => entry.status === 'Draft');
  const openReconciliations = scopedReconciliations.filter(item => !['Matched', 'Reconciled'].includes(item.status));

  const closeChecks = [
    { label: 'Trial balance', detail: !hasLedger ? 'No balances posted yet' : trialBalance.isBalanced ? 'Debit and credit totals agree' : `${formatCurrency(trialBalance.difference, currency)} variance`, passed: hasLedger && trialBalance.isBalanced },
    { label: 'Draft journals', detail: draftJournals.length === 0 ? 'No unposted vouchers' : `${draftJournals.length} voucher${draftJournals.length === 1 ? '' : 's'} require posting`, passed: draftJournals.length === 0 },
    { label: 'Approvals', detail: pendingApprovals.length === 0 ? 'Approval queue is clear' : `${pendingApprovals.length} request${pendingApprovals.length === 1 ? '' : 's'} pending`, passed: pendingApprovals.length === 0 },
    { label: 'Reconciliation', detail: openReconciliations.length === 0 ? 'Invoices are reconciled' : `${openReconciliations.length} item${openReconciliations.length === 1 ? '' : 's'} need review`, passed: openReconciliations.length === 0 },
  ];
  const passedChecks = closeChecks.filter(check => check.passed).length;

  const recentJournals = [...scopedJournals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const outstandingInvoices = scopedInvoices
    .filter(invoice => invoice.outstandingAmount > 0 && invoice.paymentStatus !== 'Cancelled')
    .sort((a, b) => {
      if (a.paymentStatus === 'Overdue' && b.paymentStatus !== 'Overdue') return -1;
      if (b.paymentStatus === 'Overdue' && a.paymentStatus !== 'Overdue') return 1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 5);

  const destinations: { label: string; detail: string; page: AppPage; icon: React.ReactNode }[] = [
    { label: 'Trial Balance', detail: 'Validate ledger equilibrium', page: 'trial-balance', icon: <Scale className="h-5 w-5" /> },
    { label: 'General Ledger', detail: 'Trace account movements', page: 'general-ledger', icon: <BookOpen className="h-5 w-5" /> },
    { label: 'Profit & Loss', detail: 'Review operating performance', page: 'profit-loss', icon: <TrendingUp className="h-5 w-5" /> },
    { label: 'Balance Sheet', detail: 'Inspect financial position', page: 'balance-sheet', icon: <Landmark className="h-5 w-5" /> },
    { label: 'Reconciliation', detail: 'Resolve matching exceptions', page: 'reconciliation', icon: <ShieldCheck className="h-5 w-5" /> },
    { label: 'Payments', detail: 'Review settlements and receipts', page: 'payments', icon: <WalletCards className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-5">
      <section className="finance-hero overflow-hidden rounded-xl border border-slate-700 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_0.7fr] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={!hasLedger ? 'amber' : trialBalance.isBalanced ? 'emerald' : 'rose'} dot>
                {!hasLedger ? 'No ledger activity yet' : trialBalance.isBalanced ? 'Books balanced' : 'Review required'}
              </Badge>
              <span className="text-xs font-medium text-slate-400">{pnl.period}</span>
            </div>
            <p className="mt-6 text-sm font-medium text-slate-400">Net operating result</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="text-4xl font-bold tracking-[-0.035em] text-slate-100 tabular-nums sm:text-5xl">
                {formatCurrency(pnl.netProfit, currency)}
              </p>
              <span className={`mb-1 text-sm font-semibold ${pnl.netProfitMarginPercentage >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {pnl.netProfitMarginPercentage.toFixed(2)}% margin
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
              Consolidated from posted ledger balances for {selectedCompanyId === 'all' ? 'all active entities' : selectedCompany?.name}.
              No projected or decorative values are included.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-850 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Period close readiness</p>
                <p className="mt-1 text-xs text-slate-400">Live controls from current records</p>
              </div>
              <span className="text-2xl font-bold text-slate-100 tabular-nums">{passedChecks}/{closeChecks.length}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800" aria-label={`${passedChecks} of ${closeChecks.length} close checks passed`}>
              <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${(passedChecks / closeChecks.length) * 100}%` }} />
            </div>
            <Button variant="outline" size="sm" className="mt-5 w-full bg-white" onClick={() => setCurrentPage('trial-balance')} rightIcon={<ArrowUpRight className="h-4 w-4" />}>
              Review close controls
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <FinanceValue label="Cash & bank" value={formatCurrency(cashBalance, currency)} detail={`${scopedBankAccounts.length} active bank account${scopedBankAccounts.length === 1 ? '' : 's'}`} icon={<Banknote className="h-5 w-5" />} />
        <FinanceValue label="Accounts receivable" value={formatCurrency(receivables, currency)} detail={`${overdueReceivables.length} overdue customer invoice${overdueReceivables.length === 1 ? '' : 's'}`} icon={<ReceiptText className="h-5 w-5" />} tone={overdueReceivables.length ? 'rose' : 'emerald'} />
        <FinanceValue label="Accounts payable" value={formatCurrency(payables, currency)} detail="Open approved and unpaid supplier invoices" icon={<WalletCards className="h-5 w-5" />} tone="amber" />
        <FinanceValue label="Working capital" value={formatCurrency(workingCapital, currency)} detail="Current assets less current liabilities" icon={<TrendingUp className="h-5 w-5" />} tone={workingCapital >= 0 ? 'emerald' : 'rose'} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Close controls</CardTitle>
            <p className="mt-1 text-sm text-slate-400">Exceptions that affect financial sign-off</p>
          </CardHeader>
          <CardContent className="space-y-1 p-3 sm:p-3">
            {closeChecks.map(check => (
              <div key={check.label} className="flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-slate-850">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${check.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {check.passed ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{check.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{check.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader action={<Button variant="ghost" size="sm" onClick={() => setCurrentPage('invoices')} rightIcon={<ChevronRight className="h-4 w-4" />}>All invoices</Button>}>
            <CardTitle>Outstanding invoices</CardTitle>
            <p className="mt-1 text-sm text-slate-400">Prioritized by overdue state and due date</p>
          </CardHeader>
          <div className="divide-y divide-slate-700">
            {outstandingInvoices.length ? outstandingInvoices.map(invoice => (
              <button key={invoice.id} onClick={() => setCurrentPage('invoices')} className="grid w-full grid-cols-[1fr_auto] gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-850 sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">{invoice.partyName}</p>
                    <Badge variant={invoice.paymentStatus === 'Overdue' ? 'rose' : 'amber'} size="sm">{invoice.paymentStatus}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{invoice.invoiceNumber} · Due {formatDate(invoice.dueDate)}</p>
                </div>
                <p className="self-center whitespace-nowrap text-sm font-bold text-slate-100 tabular-nums">{formatCurrency(invoice.outstandingAmount, currency)}</p>
              </button>
            )) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <BadgeCheck className="h-8 w-8 text-emerald-700" />
                <p className="mt-3 text-sm font-semibold text-slate-100">No outstanding invoices</p>
                <p className="mt-1 text-xs text-slate-400">All recorded invoices are settled.</p>
              </div>
            )}
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Financial workspace</h2>
            <p className="mt-1 text-sm text-slate-400">Statements, controls, and transaction registers</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {destinations.map(item => (
            <button key={item.page} onClick={() => setCurrentPage(item.page)} className="group flex min-h-20 items-center gap-4 rounded-xl border border-slate-700 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-850 text-indigo-700 transition-colors group-hover:bg-indigo-50">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-100">{item.label}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{item.detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-700" />
            </button>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader action={<Button variant="ghost" size="sm" onClick={() => setCurrentPage('general-ledger')} rightIcon={<ChevronRight className="h-4 w-4" />}>Open ledger</Button>}>
          <CardTitle>Recent ledger activity</CardTitle>
          <p className="mt-1 text-sm text-slate-400">Latest posted and draft journal vouchers</p>
        </CardHeader>
        <div className="divide-y divide-slate-700">
          {recentJournals.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-slate-400">No journal entries have been posted yet.</p>
          )}
          {recentJournals.map(entry => (
            <div key={entry.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[140px_1fr_auto] sm:items-center sm:px-6">
              <div>
                <p className="font-mono text-xs font-semibold text-indigo-700">{entry.entryNumber}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(entry.date)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{entry.description}</p>
                <p className="mt-1 text-xs text-slate-400">{entry.sourceModule || 'Manual'} · {entry.postedBy}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <Badge variant={entry.status === 'Posted' ? 'emerald' : entry.status === 'Void' ? 'rose' : 'amber'} size="sm">{entry.status}</Badge>
                <p className="whitespace-nowrap text-sm font-semibold text-slate-100 tabular-nums">{formatCurrency(entry.totalDebit, currency)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
