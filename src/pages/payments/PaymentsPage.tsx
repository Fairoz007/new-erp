import React, { useState } from 'react';
import { CreditCard, Plus, Download, Banknote, Building2, CheckCircle2 } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { Payment } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const PaymentsPage: React.FC = () => {
  const { payments, bankAccounts, invoices, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openInvoiceModal } = useUI();

  const filteredPayments = payments.filter(p => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && p.companyId !== selectedCompanyId) return false;
    return true;
  });

  const totalDisbursed = payments.filter(p => p.partyType === 'Supplier').reduce((s, p) => s + p.amount, 0);
  const totalReceived = payments.filter(p => p.partyType === 'Customer').reduce((s, p) => s + p.amount, 0);
  const totalBankBalance = bankAccounts.reduce((s, b) => s + b.currentBalance, 0);

  const columns: Column<Payment>[] = [
    {
      key: 'paymentNumber',
      header: 'Payment # / Ref',
      render: (p) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{p.paymentNumber}</span>
          <p className="text-[10px] text-slate-400 font-mono">Ref: {p.transactionReference}</p>
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
          <p className="text-[10px] text-slate-400 font-mono">Ledger Cleared</p>
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
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-payment')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Record Payment
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          title="Total Cash & Bank Balance"
          value={formatCurrency(totalBankBalance, currency)}
          subValue={`${bankAccounts.length} Corporate Accounts`}
          isHero={true}
        />
        <StatCard
          title="Supplier Disbursals (AP Paid)"
          value={formatCurrency(totalDisbursed, currency)}
          subValue="Settled vendor claims"
          trend={{ value: 'Outgoing', direction: 'down' }}
        />
        <StatCard
          title="Customer Collections (AR Received)"
          value={formatCurrency(totalReceived, currency)}
          subValue="Client wire remittances"
          trend={{ value: 'Inflow', direction: 'up' }}
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
      />
    </div>
  );
};
