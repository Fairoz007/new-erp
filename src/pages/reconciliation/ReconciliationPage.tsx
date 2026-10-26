import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { InvoiceReconciliation } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';

// No pre-filled business numbers: the user enters the PO / receipt figures being matched.
const emptyForm = {
  invoiceId: '',
  matchingType: '3-Way' as '2-Way' | '3-Way',
  purchaseOrderNumber: '',
  purchaseOrderAmount: '',
  workOrderId: '',
  workOrderNumber: '',
  workOrderAmount: '',
  goodsServiceReceivedAmount: '',
  discrepancyReason: '',
  notes: '',
};

export const ReconciliationPage: React.FC = () => {
  const { reconciliations, invoices, workOrders, addReconciliation, currency, selectedCompanyId } = useFleet();
  const { addToast } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'reconciliation');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recForm, setRecForm] = useState(emptyForm);

  const inScope = (companyId: string) => !selectedCompanyId || selectedCompanyId === 'all' || companyId === selectedCompanyId;
  const purchaseInvoices = invoices.filter(i => i.invoiceType === 'Purchase' && !i.isCreditNote && !reconciledInvoiceIds.has(i.id)
    && i.paymentStatus !== 'Cancelled' && i.approvalStatus !== 'Cancelled' && inScope(i.companyId));
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const allScopedRecs = reconciliations.filter(r => inScope(r.companyId));
  const scopedRecs = allScopedRecs.filter(r =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    (typeFilter === 'all' || r.matchingType === typeFilter) &&
    (!fromDate || (r.createdAt ?? '').slice(0, 10) >= fromDate) &&
    (!toDate || (r.createdAt ?? '').slice(0, 10) <= toDate));
  const reconciledInvoiceIds = new Set(reconciliations.map(r => r.invoiceId));
  const selectedInvoice = purchaseInvoices.find(i => i.id === recForm.invoiceId);
  const invoiceWorkOrders = selectedInvoice ? workOrders.filter(w => w.companyId === selectedInvoice.companyId) : [];
  const matchedCount = allScopedRecs.filter(r => r.status === 'Matched').length;
  const partialCount = allScopedRecs.filter(r => r.status === 'Partially Matched').length;
  const mismatchCount = allScopedRecs.filter(r => r.status === 'Mismatch').length;

  const openModal = () => { setRecForm(emptyForm); setIsModalOpen(true); };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const inv = selectedInvoice;
    if (!inv) {
      addToast({ type: 'error', title: 'No Invoice', message: 'Select a purchase invoice to reconcile.' });
      return;
    }
    const po = Number(recForm.purchaseOrderAmount);
    const received = recForm.goodsServiceReceivedAmount === '' ? undefined : Number(recForm.goodsServiceReceivedAmount);
    const woAmount = recForm.workOrderAmount === '' ? undefined : Number(recForm.workOrderAmount);
    if (!(po > 0)) {
      addToast({ type: 'error', title: 'Invalid Amounts', message: 'Enter a PO amount greater than zero.' });
      return;
    }
    if (recForm.matchingType === '3-Way' && (received === undefined || !(received >= 0))) {
      addToast({ type: 'error', title: 'Invalid Amounts', message: 'A 3-way match needs the goods/service received amount.' });
      return;
    }
    if (woAmount !== undefined && !(woAmount >= 0)) {
      addToast({ type: 'error', title: 'Invalid Amounts', message: 'Work order amount cannot be negative.' });
      return;
    }

    setSubmitting(true);
    try {
      // invoice amount, difference, variance and status are computed by the database
      const result = await addReconciliation({
        companyId: inv.companyId,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierOrCustomerName: inv.partyName,
        matchingType: recForm.matchingType,
        purchaseOrderNumber: recForm.purchaseOrderNumber.trim() || undefined,
        purchaseOrderAmount: po,
        workOrderNumber: recForm.workOrderNumber.trim() || undefined,
        workOrderAmount: woAmount,
        goodsServiceReceivedAmount: recForm.matchingType === '3-Way' ? received : undefined,
        invoiceAmount: inv.grandTotal,
        paidAmount: inv.amountPaid,
        status: 'Pending Review',
        discrepancyReason: recForm.discrepancyReason.trim() || undefined,
        notes: recForm.notes.trim() || undefined,
      });
      addToast({
        type: result.status === 'Matched' ? 'success' : 'warning',
        title: 'Reconciliation Logged',
        message: `${result.reconciliationNumber}: ${result.status} (difference ${formatCurrency(result.differenceAmount, currency)}, ${result.variancePercentage}%).`,
      });
      setIsModalOpen(false);
    } catch (err) {
      addToast({ type: 'error', title: 'Reconciliation Failed', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
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
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{r.reconciliationNumber}</p>
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
            {r.purchaseOrderAmount != null && <span className="text-slate-400"> ({formatCurrency(r.purchaseOrderAmount, currency)})</span>}
          </p>
          {r.workOrderNumber && (
            <p className="text-slate-400">
              WO: <span className="text-[#086343] font-semibold">{r.workOrderNumber}</span>
              {r.workOrderAmount != null && <span> ({formatCurrency(r.workOrderAmount, currency)})</span>}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'amounts',
      header: 'Invoice vs Expected',
      align: 'right',
      render: (r) => {
        const hasVariance = Math.abs(r.differenceAmount) >= 0.0005;
        const expected = r.matchingType === '3-Way' ? r.goodsServiceReceivedAmount : r.purchaseOrderAmount;
        return (
          <div className="text-right font-mono">
            <span className="font-bold text-slate-100">{formatCurrency(r.invoiceAmount, currency)}</span>
            <p className="text-[10px] text-slate-400">
              {r.matchingType === '3-Way' ? 'Received' : 'PO'}: {formatCurrency(expected ?? 0, currency)}
            </p>
            <p className={`text-[10px] ${hasVariance ? 'text-amber-700 font-bold' : 'text-[#086343]'}`}>
              {hasVariance ? `Diff: ${formatCurrency(r.differenceAmount, currency)} (${r.variancePercentage}%)` : 'Exact match'}
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
        <p className="text-xs text-slate-400 line-clamp-1 max-w-xs">{r.discrepancyReason || r.notes || '-'}</p>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Invoice Reconciliation
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Match supplier invoices against purchase orders (2-way) or goods/services received (3-way). Variances are calculated by the system.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canCreate && (
            <Button variant="primary" size="md" onClick={openModal} leftIcon={<Plus className="w-4 h-4" />}>
              New Reconciliation
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          title="Total Reconciliations"
          value={allScopedRecs.length}
          subValue={`${partialCount} within 5% tolerance`}
          isHero={true}
        />
        <StatCard
          title="Exact Matches"
          value={matchedCount}
          subValue="Invoice equals the expected amount"
        />
        <StatCard
          title="Mismatches"
          value={mismatchCount}
          subValue="Variance above 5%"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={scopedRecs}
        columns={columns}
        keyExtractor={r => r.id}
        title="Audit & Reconciliation Ledger"
        searchPlaceholder="Search reconciliations by invoice, supplier, PO or work order..."
        searchFields={['invoiceNumber', 'supplierOrCustomerName', 'purchaseOrderNumber', 'workOrderNumber', 'reconciliationNumber']}
        exportFilename="FleetX_Invoice_Reconciliations"
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold cursor-pointer">
              <option value="all">All Statuses</option>
              <option value="Matched">Matched</option>
              <option value="Partially Matched">Partially Matched</option>
              <option value="Mismatch">Mismatch</option>
              <option value="Pending Review">Pending Review</option>
            </select>
            <select aria-label="Matching type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold cursor-pointer">
              <option value="all">2-Way & 3-Way</option>
              <option value="2-Way">2-Way</option>
              <option value="3-Way">3-Way</option>
            </select>
            <input aria-label="From date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200" />
            <input aria-label="To date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-850 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-slate-200" />
          </div>
        }
      />

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { if (!submitting) setIsModalOpen(false); }}
        title="Invoice Reconciliation"
        description="2-way: invoice vs purchase order. 3-way: invoice vs goods/services received (with the PO on record)."
        size="lg"
      >
        <form onSubmit={handleCreateReconciliation} className="space-y-4">
          <Select
            label="Select Invoice to Reconcile"
            value={recForm.invoiceId}
            onChange={e => setRecForm({ ...recForm, invoiceId: e.target.value, workOrderId: '', workOrderNumber: '', workOrderAmount: '' })}
            required
          >
            <option value="">{purchaseInvoices.length ? 'Select a purchase invoice...' : 'No purchase invoices available'}</option>
            {purchaseInvoices.map(inv => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} - {inv.partyName} ({formatCurrency(inv.grandTotal, inv.currency)}) - {inv.approvalStatus}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Matching Method"
              value={recForm.matchingType}
              onChange={e => setRecForm({ ...recForm, matchingType: e.target.value as '2-Way' | '3-Way' })}
            >
              <option value="3-Way">3-Way Match (invoice vs goods/service received)</option>
              <option value="2-Way">2-Way Match (invoice vs purchase order)</option>
            </Select>
            <Input
              label="Purchase Order Number"
              value={recForm.purchaseOrderNumber}
              onChange={e => setRecForm({ ...recForm, purchaseOrderNumber: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={`PO Amount (${currency})`}
              type="number"
              step="0.001"
              min="0"
              value={recForm.purchaseOrderAmount}
              onChange={e => setRecForm({ ...recForm, purchaseOrderAmount: e.target.value })}
              required
            />
            <Input
              label={`Goods/Service Received (${currency})`}
              type="number"
              step="0.001"
              min="0"
              value={recForm.goodsServiceReceivedAmount}
              onChange={e => setRecForm({ ...recForm, goodsServiceReceivedAmount: e.target.value })}
              disabled={recForm.matchingType === '2-Way'}
              required={recForm.matchingType === '3-Way'}
            />
            <Select
              label="Work Order (optional)"
              value={recForm.workOrderId}
              onChange={e => {
                const wo = invoiceWorkOrders.find(w => w.id === e.target.value);
                setRecForm({
                  ...recForm,
                  workOrderId: e.target.value,
                  workOrderNumber: wo?.workOrderNumber ?? '',
                  workOrderAmount: wo ? String(wo.finalCost || wo.estimatedCost || '') : '',
                });
              }}
              disabled={!selectedInvoice}
            >
              <option value="">None</option>
              {invoiceWorkOrders.map(w => (
                <option key={w.id} value={w.id}>{w.workOrderNumber} ({w.status})</option>
              ))}
            </Select>
            <Input
              label={`WO Amount (${currency})`}
              type="number"
              step="0.001"
              min="0"
              value={recForm.workOrderAmount}
              onChange={e => setRecForm({ ...recForm, workOrderAmount: e.target.value })}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            The invoice amount, difference, variance and match status are calculated by the system when you save.
          </p>

          <Input
            label="Discrepancy Reason (if any)"
            value={recForm.discrepancyReason}
            onChange={e => setRecForm({ ...recForm, discrepancyReason: e.target.value })}
          />

          <Textarea
            label="Audit Notes & Remarks"
            value={recForm.notes}
            onChange={e => setRecForm({ ...recForm, notes: e.target.value })}
            placeholder="Document tolerance variances, exchange rate differences, or approval notes..."
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={submitting} disabled={submitting || !selectedInvoice}>
              Complete Reconciliation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
