// Approvals → Expenses: expenses above the submitter's expense limit. Approving posts them.
import React, { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { VehicleExpense } from '../../types/operations';
import { ExpenseDetailModal, useMayApproveExpense } from '../expenses/ExpenseDetailModal';
import { tableCls, tdCls, thCls } from '../setup/shared';
import { useExpenseList, useOpenExpense } from '../../services/queries-expenses';

/** Expenses waiting for approval in the office(s) in view, from the database (all pages of ≤ 1000 rows). */
export function usePendingExpensesQuery() {
  const { selectedCompanyId } = useFleet();
  return useExpenseList({ company: selectedCompanyId, status: 'Pending Approval' });
}
export function usePendingExpenses(): VehicleExpense[] {
  return usePendingExpensesQuery().data ?? [];
}

export const ExpenseQueue: React.FC = () => {
  const { companies, currency } = useFleet();
  const pending = usePendingExpensesQuery();
  const rows = pending.data ?? [];
  const mayApprove = useMayApproveExpense();
  const [open, setOpen] = useState<VehicleExpense | null>(null);
  // the open expense, re-read after each action (it leaves this list once approved or rejected)
  const current = useOpenExpense(open);
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
      <table className={tableCls}>
        <thead><tr><th className={thCls}>Expense</th><th className={thCls}>Office</th><th className={thCls}>Date</th><th className={`${thCls} text-right`}>Amount</th><th className={thCls} /></tr></thead>
        <tbody>
          {pending.loading && <tr><td className={tdCls} colSpan={5}>Loading…</td></tr>}
          {pending.error && <tr><td className={tdCls} colSpan={5}><span role="alert" className="text-rose-500">Expenses could not be loaded: {pending.error.message}</span> <Button size="xs" variant="ghost" onClick={() => void pending.refetch()}>Retry</Button></td></tr>}
          {!pending.loading && !pending.error && rows.length === 0 && <tr><td className={tdCls} colSpan={5}>No expenses waiting for approval.</td></tr>}
          {rows.map(e => (
            <tr key={e.id}>
              <td className={tdCls}><p className="font-semibold text-slate-100">{e.expenseNumber} · {e.category}</p><p className="text-[11px] text-slate-400">{e.description}{e.vehiclePlate ? ` · ${e.vehiclePlate}` : ''}</p></td>
              <td className={tdCls}>{companies.find(c => c.id === e.companyId)?.name ?? '—'}</td>
              <td className={tdCls}>{formatDate(e.date)}</td>
              <td className={`${tdCls} text-right font-mono font-bold`}>{formatCurrency(e.total, currency)}</td>
              <td className={`${tdCls} text-right`}>
                {mayApprove(e) ? <Button size="xs" variant="ghost" onClick={() => setOpen(e)}>Review</Button>
                  : <><Badge variant="slate">Needs a higher limit or another approver</Badge> <Button size="xs" variant="ghost" onClick={() => setOpen(e)}>Open</Button></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {current && <ExpenseDetailModal expense={current} onClose={() => setOpen(null)} />}
    </div>
  );
};
