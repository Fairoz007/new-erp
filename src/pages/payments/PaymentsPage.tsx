import React, { useState } from 'react';
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

export const PaymentsPage: React.FC = () => {
  const { payments, bankAccounts, currency, selectedCompanyId } = useFleet();
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
  const filteredPayments = payments.filter(p => {
    if (!inCompany(p.companyId)) return false;
    if (methodFilter !== 'all' && p.paymentMethod !== methodFilter) return false;
    if (bankFilter !== 'all' && p.bankAccountId !== bankFilter) return false;
    if (partyFilter !== 'all' && p.partyType !== partyFilter) return false;
    if (fromDate && p.paymentDate < fromDate) return false;
    if (toDate && p.paymentDate > toDate) return false;
    return true;
  });
  const methods = Array.from(new Set(payments.map(p => p.paymentMethod)));
  const filtersActive = methodFilter !== 'all' || bankFilter !== 'all' || partyFilter !== 'all' || !!fromDate || !!toDate;

  // Totals are kept per currency: amounts in different currencies are never added together
  const sumByCurrency = (rows: { currency?: string }[], amount: (r: any) => number): Record<string, number> =>
    rows.reduce<Record<string, number>>((acc, r) => { const c = r.currency || currency; acc[c] = (acc[c] ?? 0) + amount(r); return acc; }, {});
  const fmtTotals = (m: Record<string, number>) => {
    const entries = Object.entries(m);
    return entries.length === 0 ? formatCurrency(0, currency) : entries.map(([c, v]) => formatCurrency(v, c)).join(' + ');
  };
  const totalDisbursed = sumByCurrency(filteredPayments.filter(p => p.partyType === 'Supplier'), p => p.amount);
  const totalReceived = sumByCurrency(filteredPayments.filter(p => p.partyType === 'Customer'), p => p.amount);
  // Bank balances come from v_bank_balances (opening balance + recorded payments)
  const scopedBanks = bankAccounts.filter(b => inCompany(b.companyId));
  const totalBankBalance = sumByCurrency(scopedBanks, b => b.currentBalance);

  const columns: Column<Payment>[] = [
    {
      key: 'paymentNumber',
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
      header: 'Beneficiary / Customer',
      render: (p) => (
        <div>
          <span className="font-bold text-slate-200">{p.partyName}</span>
          <p className="text-[10px] text-slate-400">{p.partyType}</p>
        </div>
      ),
    },
    {
      key: 'paymentDate',
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Payments & Disbursals Register
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Accounts Payable disbursals, customer collections, and real-time bank reconciliation statements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Button
              variant="primary"
              size="sm"
              className="rounded-full shadow-sm"
              onClick={() => openQuickModal('add-payment')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Record Payment
            </Button>
          )}
        </div>
      </div>

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

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-700 rounded-2xl shadow-card text-xs">
        <span className="text-slate-400 font-semibold px-1">Filter by:</span>
        <select
          value={methodFilter}
          onChange={e => setMethodFilter(e.target.value)}
          className="bg-white border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 cursor-pointer"
        >
          <option value="all">All Methods</option>
          {methods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={bankFilter}
          onChange={e => setBankFilter(e.target.value)}
          className="bg-white border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 cursor-pointer"
        >
          <option value="all">All Bank Accounts</option>
          {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountName}</option>)}
        </select>
        <select
          value={partyFilter}
          onChange={e => setPartyFilter(e.target.value)}
          className="bg-white border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 cursor-pointer"
        >
          <option value="all">All Parties</option>
          <option value="Supplier">Suppliers (AP)</option>
          <option value="Customer">Customers (AR)</option>
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="bg-white border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-forest-500/20"
            title="From date"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="bg-white border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-forest-500/20"
            title="To date"
          />
        </div>
        {filtersActive && (
          <button
            onClick={() => { setMethodFilter('all'); setBankFilter('all'); setPartyFilter('all'); setFromDate(''); setToDate(''); }}
            className="text-xs font-bold text-[#086343] hover:underline cursor-pointer ml-auto px-2"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Payments Table */}
      <DataTable
        data={filteredPayments}
        collection={['payments', 'invoices']}
        columns={columns}
        keyExtractor={p => p.id}
        title="Transaction Records"
        searchPlaceholder="Search payments by reference, invoice #, party, cheque #..."
        searchFields={['paymentNumber', 'invoiceNumber', 'partyName', 'transactionReference', 'chequeNumber', 'paymentMethod']}
        exportFilename="FleetX_Payments_Register"
      />

      <PaymentDetailModal
        payment={viewingPayment}
        isOpen={!!viewingPayment}
        onClose={() => setViewingPayment(null)}
      />
    </div>
  );
};
