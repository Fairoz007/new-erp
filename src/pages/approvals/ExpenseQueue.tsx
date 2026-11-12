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

export function usePendingExpenses() {
  const { expenses, selectedCompanyId } = useFleet();
  return expenses.filter(e => e.status === 'Pending Approval' && (selectedCompanyId === 'all' || e.companyId === selectedCompanyId));
}

export const ExpenseQueue: React.FC = () => {
  const { companies, currency } = useFleet();
  const rows = usePendingExpenses();
  const mayApprove = useMayApproveExpense();
  const [open, setOpen] = useState<VehicleExpense | null>(null);
  const { expenses } = useFleet();
  const current = open ? expenses.find(e => e.id === open.id) ?? null : null;
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
      <table className={tableCls}>
        <thead><tr><th className={thCls}>Expense</th><th className={thCls}>Office</th><th className={thCls}>Date</th><th className={`${thCls} text-right`}>Amount</th><th className={thCls} /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className={tdCls} colSpan={5}>No expenses waiting for approval.</td></tr>}
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
