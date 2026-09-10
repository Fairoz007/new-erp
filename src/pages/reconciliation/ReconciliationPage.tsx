import React, { useState } from 'react';
import { GitCompare, CheckCircle2, AlertTriangle, HelpCircle, ArrowRight, Plus } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { InvoiceReconciliation } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const ReconciliationPage: React.FC = () => {
  const { reconciliations, invoices, workOrders, addReconciliation, currency } = useFleet();
  const { addToast } = useUI();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [recForm, setRecForm] = useState({
    invoiceId: invoices[0]?.id || '',
    matchingType: '3-Way' as '2-Way' | '3-Way',
    purchaseOrderNumber: 'PO-2026-0092',
    purchaseOrderAmount: 295,
    workOrderNumber: 'WO-2026-104',
    workOrderAmount: 294.25,
    goodsServiceReceivedAmount: 294,
    notes: '',
  });

  const matchedCount = reconciliations.filter(r => r.status === 'Matched').length;
  const mismatchCount = reconciliations.filter(r => r.status === 'Mismatch').length;

  const handleCreateReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    const inv = invoices.find(i => i.id === recForm.invoiceId);
    if (!inv) return;

    addReconciliation({
      companyId: inv.companyId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      supplierOrCustomerName: inv.partyName,
      matchingType: recForm.matchingType,
      purchaseOrderNumber: recForm.purchaseOrderNumber,
      purchaseOrderAmount: Number(recForm.purchaseOrderAmount),
      workOrderNumber: recForm.workOrderNumber,
      workOrderAmount: Number(recForm.workOrderAmount),
      goodsServiceReceivedAmount: Number(recForm.goodsServiceReceivedAmount),
      invoiceAmount: inv.grandTotal,
      paidAmount: inv.amountPaid,
      status: 'Matched',
      notes: recForm.notes,
    });

    addToast({ type: 'success', title: 'Reconciliation Logged', message: `3-Way match executed for ${inv.invoiceNumber}.` });
    setIsModalOpen(false);
  };

  const columns: Column<InvoiceReconciliation>[] = [
    {
      key: 'reconciliationNumber',
      header: 'Reconciliation # / Ref',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{r.reconciliationNumber}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
              {r.matchingType} Match
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Inv: {r.invoiceNumber}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'party',
      header: 'Party / Reference',
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-200">{r.supplierOrCustomerName}</p>
          <p className="text-[10px] text-slate-400 font-mono">PO: {r.purchaseOrderNumber || '-'} • WO: {r.workOrderNumber || '-'}</p>
        </div>
      ),
    },
    {
      key: 'invoiceAmount',
      header: 'Invoice Amount',
      align: 'right',
      render: (r) => <span className="font-bold text-slate-100">{formatCurrency(r.invoiceAmount, currency)}</span>,
    },
    {
      key: 'expectedAmount',
      header: 'Expected (PO/WO)',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-slate-300">
          {formatCurrency(r.goodsServiceReceivedAmount || r.workOrderAmount || r.purchaseOrderAmount, currency)}
        </span>
      ),
    },
    {
      key: 'variancePercentage',
      header: 'Variance %',
      align: 'center',
      render: (r) => (
        <div className="text-center">
          <span className={`font-mono font-bold text-xs ${r.variancePercentage === 0 ? 'text-emerald-400' : r.variancePercentage <= 5 ? 'text-amber-400' : 'text-rose-400'}`}>
            {r.variancePercentage.toFixed(2)}%
          </span>
          {r.differenceAmount !== 0 && (
            <p className="text-[10px] text-slate-400">Diff: {formatCurrency(r.differenceAmount, currency)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Match Status',
      align: 'center',
      render: (r) => <StatusBadge status={r.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <GitCompare className="w-6 h-6 text-indigo-400" />
            <span>Invoice Reconciliation (2-Way & 3-Way Matching)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Audit and verify purchase orders, work orders, service completion slips, and supplier invoices to prevent overbilling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Reconciliation
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Reconciliations"
          value={reconciliations.length}
          subValue="Audited invoice batches"
          icon={<GitCompare className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Exact Matches (0.0% Variance)"
          value={matchedCount}
          subValue="Fully cleared for payment"
          icon={<CheckCircle2 className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Discrepancies / Mismatches"
          value={mismatchCount}
          subValue="Requires management audit"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={reconciliations}
        columns={columns}
        keyExtractor={r => r.id}
        title="Audit & Reconciliation Ledger"
        searchPlaceholder="Search reconciliations by invoice, supplier, PO or work order..."
        exportFilename="FleetX_Invoice_Reconciliations"
      />

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Execute Invoice 3-Way Match"
        description="Cross-reference Purchase Order ↔ Work Order ↔ Supplier Invoice"
        size="lg"
      >
        <form onSubmit={handleCreateReconciliation} className="space-y-4">
          <Select
            label="Select Invoice to Reconcile"
            value={recForm.invoiceId}
            onChange={e => setRecForm({ ...recForm, invoiceId: e.target.value })}
            required
          >
            {invoices.map(inv => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} - {inv.partyName} ({formatCurrency(inv.grandTotal, inv.currency)})
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Matching Method"
              value={recForm.matchingType}
              onChange={e => setRecForm({ ...recForm, matchingType: e.target.value as any })}
            >
              <option value="3-Way">3-Way Match (PO ↔ Work Order ↔ Invoice)</option>
              <option value="2-Way">2-Way Match (PO ↔ Invoice)</option>
            </Select>
            <Input
              label="Purchase Order Number"
              value={recForm.purchaseOrderNumber}
              onChange={e => setRecForm({ ...recForm, purchaseOrderNumber: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <Input
              label="PO Amount (OMR)"
              type="number"
              step="0.001"
              value={recForm.purchaseOrderAmount}
              onChange={e => setRecForm({ ...recForm, purchaseOrderAmount: Number(e.target.value) })}
            />
            <Input
              label="Work Order Amount (OMR)"
              type="number"
              step="0.001"
              value={recForm.workOrderAmount}
              onChange={e => setRecForm({ ...recForm, workOrderAmount: Number(e.target.value) })}
            />
            <Input
              label="Actual Delivered (OMR)"
              type="number"
              step="0.001"
              value={recForm.goodsServiceReceivedAmount}
              onChange={e => setRecForm({ ...recForm, goodsServiceReceivedAmount: Number(e.target.value) })}
            />
          </div>

          <Textarea
            label="Reconciliation Notes / Discrepancy Justification"
            placeholder="Document variance reasons if applicable..."
            value={recForm.notes}
            onChange={e => setRecForm({ ...recForm, notes: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" leftIcon={<GitCompare className="w-4 h-4" />}>
              Save Match Result
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
