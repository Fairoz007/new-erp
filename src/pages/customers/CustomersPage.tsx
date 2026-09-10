import React from 'react';
import { Users, Plus, Phone, Mail, MapPin, DollarSign, CreditCard } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Customer } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';

export const CustomersPage: React.FC = () => {
  const { customers, currency } = useFleet();

  const totalCustomers = customers.length;
  const totalSales = customers.reduce((s, c) => s + c.totalSales, 0);
  const totalOutstandingAR = customers.reduce((s, c) => s + c.currentBalance, 0);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer / Client',
      render: (c) => (
        <div>
          <span className="font-bold text-slate-100">{c.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono text-indigo-400 font-semibold">{c.customerId}</span>
            <span className="text-[10px] text-slate-400">• {c.customerType}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Person & Phone',
      render: (c) => (
        <div>
          <p className="text-slate-200">{c.contactPerson}</p>
          <p className="text-[11px] text-slate-400">{c.phone}</p>
        </div>
      ),
    },
    {
      key: 'paymentTermsDays',
      header: 'Payment Terms',
      render: (c) => <span className="text-slate-300">{c.paymentTermsDays} Days Net</span>,
    },
    {
      key: 'creditLimit',
      header: 'Credit Limit',
      align: 'right',
      render: (c) => <span className="font-mono text-slate-300">{formatCurrency(c.creditLimit, currency)}</span>,
    },
    {
      key: 'totalSales',
      header: 'Total Billings YTD',
      align: 'right',
      render: (c) => (
        <div className="text-right">
          <span className="font-semibold text-slate-200">{formatCurrency(c.totalSales, currency)}</span>
          <p className="text-[10px] text-slate-500">{c.totalInvoicesCount} Invoices</p>
        </div>
      ),
    },
    {
      key: 'currentBalance',
      header: 'Receivables (AR)',
      align: 'right',
      render: (c) => (
        <div className="text-right">
          <span className={`font-bold ${c.currentBalance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {formatCurrency(c.currentBalance, currency)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (c) => <StatusBadge status={c.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-400" />
            <span>Customer Accounts & Billing</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Corporate clients, long-term concession transport contracts, rental agreements, and Accounts Receivable (AR).
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Corporate Clients"
          value={totalCustomers}
          subValue="Contracted partners"
          icon={<Users className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Total Logistics Revenue"
          value={formatCurrency(totalSales, currency)}
          subValue="Haulage & passenger transport"
          icon={<DollarSign className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Accounts Receivable (AR)"
          value={formatCurrency(totalOutstandingAR, currency)}
          subValue="Outstanding customer invoices"
          icon={<CreditCard className="w-4 h-4" />}
          variant="blue"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={customers}
        columns={columns}
        keyExtractor={c => c.id}
        title="Customer Directory"
        searchPlaceholder="Search customers by company name, contact person, phone..."
        searchFields={['name', 'customerType', 'contactPerson', 'phone', 'vatNumber']}
        exportFilename="FleetX_Customers_Directory"
      />
    </div>
  );
};
