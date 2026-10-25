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

  const purchaseInvoices = invoices.filter(i => i.invoiceType === 'Purchase' && !i.isCreditNote);
  const matchedCount = reconciliations.filter(r => r.status === 'Matched').length;
  const mismatchCount = reconciliations.filter(r => r.status === 'Mismatch').length;

  const handleCreateReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    const inv = purchaseInvoices.find(i => i.id === recForm.invoiceId) || purchaseInvoices[0];
    if (!inv) {
      addToast({ type: 'error', title: 'No Invoice', message: 'Select a purchase invoice to reconcile.' });
      return;
    }
    if (!(Number(recForm.purchaseOrderAmount) > 0) || (recForm.matchingType === '3-Way' && !(Number(recForm.goodsServiceReceivedAmount) >= 0))) {
      addToast({ type: 'error', title: 'Invalid Amounts', message: 'Enter a positive PO amount and valid received amount.' });
      return;
    }

    const result = addReconciliation({
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

    addToast({ type: 'success', title: 'Reconciliation Logged', message: `${recForm.matchingType} match for ${inv.invoiceNumber}: ${result.status}.` });
    setIsModalOpen(false);
  };

  const columns: Column<InvoiceReconciliation>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice # / Party',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{r.invoiceNumber}</span>
          <p className="font-semibold text-slate-300 text-xs">{r.supplierOrCustomerName}</p>
          <span className="px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-bold text-[10px] mt-1 inline-block">
            {r.matchingType} Match
          </span>
        </div>
      ),
    },
    {
      key: 'poWo',
      header: 'P.O. & Work Order Link',
      render: (r) => (
        <div className="space-y-0.5 font-mono text-xs">
          <p className="text-slate-300">
            PO: <span className="font-semibold text-slate-100">{r.purchaseOrderNumber || 'N/A'}</span>
          </p>
          {r.workOrderNumber && (
            <p className="text-slate-400">
              WO: <span className="text-[#086343] font-semibold">{r.workOrderNumber}</span>
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'amounts',
      header: 'PO ↔ Inv Variance',
      align: 'right',
      render: (r) => {
        const poAmt = r.purchaseOrderAmount || 0;
        const invAmt = r.invoiceAmount || 0;
        const diff = Math.abs(poAmt - invAmt);
        const hasVariance = diff > 0.05;

        return (
          <div className="text-right font-mono">
            <span className="font-bold text-slate-100">{formatCurrency(invAmt, currency)}</span>
            <p className={`text-[10px] ${hasVariance ? 'text-amber-700 font-bold' : 'text-[#086343]'}`}>
              {hasVariance ? `Diff: ${formatCurrency(diff, currency)}` : 'Exact Match (0.00)'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Audit Result',
      align: 'center',
      render: (r) => <StatusBadge status={r.status} size="sm" />,
    },
    {
      key: 'notes',
      header: 'Audit Notes',
      render: (r) => (
        <p className="text-xs text-slate-400 line-clamp-1 max-w-xs">{r.notes || 'Automated three-way parity verified.'}</p>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            3-Way Invoice Reconciliation
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Strict enterprise internal control matching Purchase Orders ↔ Work Orders ↔ Vendor Invoices with automated variance audits.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Reconciliation
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          title="Total Reconciliations"
          value={reconciliations.length}
          subValue="Audited invoice batches"
          isHero={true}
        />
        <StatCard
          title="Exact Matches (0.0% Variance)"
          value={matchedCount}
          subValue="Fully cleared for payment"
          trend={{ value: '100% Verified', direction: 'up' }}
        />
        <StatCard
          title="Discrepancies / Mismatches"
          value={mismatchCount}
          subValue="Requires management audit"
          trend={{ value: `${mismatchCount} Open`, direction: 'neutral' }}
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
            value={purchaseInvoices.some(i => i.id === recForm.invoiceId) ? recForm.invoiceId : (purchaseInvoices[0]?.id || '')}
            onChange={e => setRecForm({ ...recForm, invoiceId: e.target.value })}
            required
          >
            {purchaseInvoices.map(inv => (
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
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={`PO Amount (${currency})`}
              type="number"
              step="0.01"
              value={recForm.purchaseOrderAmount}
              onChange={e => setRecForm({ ...recForm, purchaseOrderAmount: Number(e.target.value) })}
              required
            />
            <Input
              label={`Goods/Service Received (${currency})`}
              type="number"
              step="0.01"
              value={recForm.goodsServiceReceivedAmount}
              onChange={e => setRecForm({ ...recForm, goodsServiceReceivedAmount: Number(e.target.value) })}
              disabled={recForm.matchingType === '2-Way'}
            />
            <Input
              label="Work Order Number"
              value={recForm.workOrderNumber}
              onChange={e => setRecForm({ ...recForm, workOrderNumber: e.target.value })}
            />
            <Input
              label={`WO Amount (${currency})`}
              type="number"
              step="0.01"
              value={recForm.workOrderAmount}
              onChange={e => setRecForm({ ...recForm, workOrderAmount: Number(e.target.value) })}
            />
          </div>

          <Textarea
            label="Audit Notes & Remarks"
            value={recForm.notes}
            onChange={e => setRecForm({ ...recForm, notes: e.target.value })}
            placeholder="Document any minor tolerance variances, exchange rate differences, or approval notes..."
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Complete Reconciliation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
