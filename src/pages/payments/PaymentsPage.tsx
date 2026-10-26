import React, { useState } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { Payment } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const PaymentsPage: React.FC = () => {
  const { payments, bankAccounts, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openInvoiceModal, openBillModal } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'payments');

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
        <div>
          <span className="font-mono font-bold text-slate-100">{p.paymentNumber}</span>
          {p.transactionReference && <p className="text-[10px] text-slate-400 font-mono">Ref: {p.transactionReference}</p>}
          {p.chequeNumber && <p className="text-[10px] text-slate-400 font-mono">Cheque: {p.chequeNumber}</p>}
          {p.attachmentUrl && (
            <button
              onClick={() => openBillModal(p.attachmentUrl!, p.attachmentName || p.paymentNumber)}
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
      header: 'Settlement Account',
      render: (p) => (
        <div>
          <span className="text-slate-200 font-semibold">{p.bankAccountName}</span>
          <p className="text-[10px] text-slate-400">{p.paymentMethod}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Settled Amount',
      align: 'right',
      render: (p) => (
        <div className="text-right font-mono">
          <span className={`text-sm font-extrabold ${p.partyType === 'Supplier' ? 'text-rose-600' : 'text-[#086343]'}`}>
            {p.partyType === 'Supplier' ? '-' : '+'}{formatCurrency(p.amount, p.currency)}
          </span>
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
            Payments & Treasury Register
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Track invoice payment settlements, partial payments, wire transfers, cheques, and corporate bank balances.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canCreate && <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-payment')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Record Payment
          </Button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          title="Total Cash & Bank Balance"
          value={fmtTotals(totalBankBalance)}
          subValue={`${scopedBanks.length} bank account(s)`}
          isHero={true}
        />
        <StatCard
          title="Supplier Disbursals (AP Paid)"
          value={fmtTotals(totalDisbursed)}
          subValue={`${filteredPayments.filter(p => p.partyType === 'Supplier').length} payment(s) to suppliers`}
        />
        <StatCard
          title="Customer Collections (AR Received)"
          value={fmtTotals(totalReceived)}
          subValue={`${filteredPayments.filter(p => p.partyType === 'Customer').length} receipt(s) from customers`}
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredPayments}
        columns={columns}
        keyExtractor={p => p.id}
        title="Payment Transactions Ledger"
        searchPlaceholder="Search payments by number, invoice, beneficiary, bank or reference..."
        exportFilename="FleetX_Payments_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Party type" value={partyFilter} onChange={e => setPartyFilter(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold cursor-pointer">
              <option value="all">Paid & Received</option>
              <option value="Supplier">Paid to suppliers</option>
              <option value="Customer">Received from customers</option>
            </select>
            <select aria-label="Payment method" value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold cursor-pointer">
              <option value="all">All Methods</option>
              {methods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select aria-label="Bank account" value={bankFilter} onChange={e => setBankFilter(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold cursor-pointer">
              <option value="all">All Bank Accounts</option>
              {scopedBanks.map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
            </select>
            <input aria-label="From date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200" />
            <input aria-label="To date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200" />
            {filtersActive && (
              <button className="text-xs font-bold text-[#086343] underline cursor-pointer" onClick={() => { setMethodFilter('all'); setBankFilter('all'); setPartyFilter('all'); setFromDate(''); setToDate(''); }}>
                Clear filters
              </button>
            )}
          </div>
        }
      />
    </div>
  );
};
