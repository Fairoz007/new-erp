import React, { useMemo, useState } from 'react';
import { Plus, Paperclip, Eye } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { Payment } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { PaymentDetailModal } from './PaymentDetailModal';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { paymentListSource, usePaymentTotals, type PaymentListFilter } from '../../services/queries-expenses';
import { FilterInput, FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';

export const PaymentsPage: React.FC = () => {
  const { bankAccounts, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openInvoiceModal, openBillModal } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'payments');

  const [viewingPayment, setViewingPayment] = useState<Payment | null>(null);
  const [methodFilter, setMethodFilter] = useState('all');
  const [bankFilter, setBankFilter] = useState('all');
  const [partyFilter, setPartyFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const inCompany = (companyId: string) => !selectedCompanyId || selectedCompanyId === 'all' || companyId === selectedCompanyId;
  // The register is paged, filtered and searched in the database (v_payment_list); the totals come
  // from payment_totals for the same filters.
  const filter: PaymentListFilter = {
    companyId: selectedCompanyId,
    method: methodFilter !== 'all' ? methodFilter : undefined,
    bankAccountId: bankFilter !== 'all' ? bankFilter : undefined,
    partyType: partyFilter !== 'all' ? partyFilter as PaymentListFilter['partyType'] : undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  };
  const source = useMemo(() => paymentListSource(filter), [JSON.stringify(filter)]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = usePaymentTotals(filter);
  const methods = totals.data?.methods ?? [];
  const filtersActive = methodFilter !== 'all' || bankFilter !== 'all' || partyFilter !== 'all' || !!fromDate || !!toDate;

  // Totals are kept per currency: amounts in different currencies are never added together
  const sumByCurrency = <R,>(rows: R[], cur: (r: R) => string | null | undefined, amount: (r: R) => number): Record<string, number> =>
    rows.reduce<Record<string, number>>((acc, r) => { const c = cur(r) || currency; acc[c] = (acc[c] ?? 0) + amount(r); return acc; }, {});
  const fmtTotals = (m: Record<string, number>) => {
    const entries = Object.entries(m);
    return entries.length === 0 ? formatCurrency(0, currency) : entries.map(([c, v]) => formatCurrency(v, c)).join(' + ');
  };
  const totalDisbursed = sumByCurrency(totals.data?.disbursed ?? [], t => t.currency, t => t.total);
  const totalReceived = sumByCurrency(totals.data?.received ?? [], t => t.currency, t => t.total);
  // Bank balances come from v_bank_balances (opening balance + recorded payments)
  const scopedBanks = bankAccounts.filter(b => inCompany(b.companyId));
  const totalBankBalance = sumByCurrency(scopedBanks, b => b.currency, b => b.currentBalance);

  const columns: Column<Payment>[] = [
    {
      key: 'paymentNumber',
      sortKey: 'payment_number',
      header: 'Payment # / Ref',
      render: (p) => (
        <div className="cursor-pointer group" onClick={() => setViewingPayment(p)}>
          <span className="font-mono font-bold text-slate-100 group-hover:text-forest-400 transition-colors">{p.paymentNumber}</span>
          {p.transactionReference && <p className="text-[10px] text-slate-400 font-mono">Ref: {p.transactionReference}</p>}
          {p.chequeNumber && <p className="text-[10px] text-slate-400 font-mono">Cheque: {p.chequeNumber}</p>}
          {p.attachmentUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openBillModal(p.attachmentUrl!, p.attachmentName || p.paymentNumber);
              }}
              className="inline-flex items-center gap-1 text-[10px] text-[#086343] font-bold hover:underline cursor-pointer"
            >
              <Paperclip className="w-3 h-3" /> Receipt
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'invoiceNumber',
      sortKey: 'invoice_number',
      header: 'Linked Invoice',
      render: (p) => (
        <button
          onClick={() => openInvoiceModal(p.invoiceId)}
          className="font-mono text-[#086343] font-bold hover:underline cursor-pointer text-left"
        >
          {p.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'party',
      sortKey: 'party_name',
      header: 'Beneficiary / Customer',
      truncate: true,
      render: (p) => (
        <div>
          <span className="font-bold text-slate-200">{p.partyName}</span>
          <p className="text-[10px] text-slate-400">{p.partyType}</p>
        </div>
      ),
    },
    {
      key: 'paymentDate',
      sortKey: 'payment_date',
      header: 'Payment Date',
      render: (p) => (
        <div>
          <span className="text-slate-300 font-medium">{formatDate(p.paymentDate)}</span>
          <p className="text-[10px] text-slate-400">{p.paymentMethod}</p>
        </div>
      ),
    },
    {
      key: 'bankAccount',
      sortKey: 'bank_account_name',
      header: 'Account / Mode',
      render: (p) => (
        <div>
          <span className="font-medium text-slate-300">{p.bankAccountName || 'General Account'}</span>
          <p className="text-[10px] text-slate-500 font-mono">{p.paymentMethod}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      sortKey: 'amount',
      header: 'Amount',
      align: 'right',
      render: (p) => (
        <div className="text-right">
          <span className={`font-mono font-bold text-sm ${p.partyType === 'Customer' ? 'text-emerald-400' : 'text-slate-100'}`}>
            {formatCurrency(p.amount, p.currency)}
          </span>
          <p className="text-[10px] text-slate-500 font-medium">{p.partyType === 'Customer' ? 'Received (CR)' : 'Paid (DR)'}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right' as const,
      sortable: false,
      render: (p: Payment) => (
        <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" onClick={() => setViewingPayment(p)} leftIcon={<Eye className="w-3.5 h-3.5" />}>
            Voucher
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Payments & Disbursals Register"
        description="Accounts Payable disbursals, customer collections, and real-time bank reconciliation statements."
        actions={
          <>
            {canCreate && (
              <Button
                variant="primary"
                size="md"
                onClick={() => openQuickModal('add-payment')}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Record Payment
              </Button>
            )}
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Vendor Disbursals"
          value={fmtTotals(totalDisbursed)}
          subValue={filtersActive ? 'Filtered supplier payments' : 'All supplier payments'}
          variant="amber"
          isHero={true}
        />
        <StatCard
          title="Customer Collections (AR)"
          value={fmtTotals(totalReceived)}
          subValue={filtersActive ? 'Filtered customer receipts' : 'All customer receipts'}
          variant="emerald"
        />
        <StatCard
          title="Available Bank Balances"
          value={fmtTotals(totalBankBalance)}
          subValue="Consolidated across active bank accounts"
          variant="blue"
        />
      </div>

      {totals.error && (
        <p role="alert" className="text-xs text-rose-500">
          Payment totals could not be loaded: {totals.error.message}{' '}
          <button type="button" className="underline" onClick={() => void totals.refetch()}>Retry</button>
        </p>
      )}

      {/* Payments Table */}
      <DataTable
        server={source}
        columns={columns}
        keyExtractor={p => p.id}
        title="Transaction Records"
        searchPlaceholder="Search payments by reference, invoice #, party, cheque #..."
        exportFilename="Payments_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect aria-label="Payment method" value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
              <option value="all">All Methods</option>
              {methods.map(m => <option key={m} value={m}>{m}</option>)}
            </FilterSelect>
            <FilterSelect aria-label="Bank account" value={bankFilter} onChange={e => setBankFilter(e.target.value)}>
              <option value="all">All Bank Accounts</option>
              {scopedBanks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountName}</option>)}
            </FilterSelect>
            <FilterSelect aria-label="Party type" value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
              <option value="all">All Parties</option>
              <option value="Supplier">Suppliers (AP)</option>
              <option value="Customer">Customers (AR)</option>
            </FilterSelect>
            <div className="flex items-center gap-1.5">
              <FilterInput type="date" aria-label="From date" title="From date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              <span className="text-xs text-slate-500">to</span>
              <FilterInput type="date" aria-label="To date" title="To date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => { setMethodFilter('all'); setBankFilter('all'); setPartyFilter('all'); setFromDate(''); setToDate(''); }}
                className="text-xs font-bold text-[#086343] hover:underline cursor-pointer px-2"
              >
                Reset Filters
              </button>
            )}
          </div>
        }
      />

      <PaymentDetailModal
        payment={viewingPayment}
        isOpen={!!viewingPayment}
        onClose={() => setViewingPayment(null)}
      />
    </div>
  );
};
