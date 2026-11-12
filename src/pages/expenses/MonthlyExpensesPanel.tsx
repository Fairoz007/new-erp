// Expenses → Monthly expenses: recurring templates, what is coming up, and drafts that are overdue.
// A daily database job creates the drafts; "Create due drafts now" runs the same generator for the
// offices where the user may create expenses.
import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useMaster } from '../../hooks/useMaster';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import type { RecurringExpense, ExpenseCategory } from '../../services/org';
import { generateRecurringExpenses, nextRecurringDate } from '../../services/expenses';
import { RecurringExpensesEditor } from '../setup/steps/ExpenseCategoriesStep';
import { VehicleExpense } from '../../types/operations';
import { tableCls, tdCls, thCls } from '../setup/shared';
import { EXPENSE_RELOAD } from './ExpenseDetailModal';

export const MonthlyExpensesPanel: React.FC<{ onOpen: (e: VehicleExpense) => void }> = ({ onOpen }) => {
  const { expenses, companies, selectedCompanyId, currency, reload } = useFleet();
  const { hasPermission } = useAuth();
  const { addToast } = useUI();
  const { rows: templates } = useMaster<RecurringExpense>('recurringExpenses');
  const { rows: categories } = useMaster<ExpenseCategory>('expenseCategories');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = localToday();
  const inScope = (companyId: string) => selectedCompanyId === 'all' || companyId === selectedCompanyId;
  const editOffices = companies.filter(c => inScope(c.id) && hasPermission('edit', 'expenses', c.id)).map(c => c.id);
  const canGenerate = companies.some(c => inScope(c.id) && hasPermission('create', 'expenses', c.id));
  const office = (id: string) => companies.find(c => c.id === id)?.code ?? '—';

  const upcoming = templates.filter(t => inScope(t.companyId))
    .map(t => ({ t, next: nextRecurringDate(t, today) }))
    .filter(x => x.next)
    .sort((a, b) => (a.next! < b.next! ? -1 : 1));
  const drafts = expenses.filter(e => e.recurringExpenseId && e.status === 'Draft' && inScope(e.companyId)).sort((a, b) => a.date.localeCompare(b.date));
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const n = await generateRecurringExpenses();
      await reload([...EXPENSE_RELOAD]);
      addToast({ type: 'success', title: n ? `${n} draft(s) created` : 'Nothing due', message: n ? 'Submit them for approval below.' : 'All monthly expenses due so far already have a draft.' });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400 max-w-2xl">Each active template creates a draft expense on its day of the month. Drafts are not costs until submitted and approved. Drafts older than a week are flagged as overdue.</p>
        {canGenerate && <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={busy} disabled={busy} onClick={() => void generate()}>Create due drafts now</Button>}
      </div>
      {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
          <p className="px-4 pt-3 text-sm font-bold text-slate-100">Drafts to submit</p>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Expense</th><th className={thCls}>Due</th><th className={`${thCls} text-right`}>Amount</th></tr></thead>
            <tbody>
              {drafts.length === 0 && <tr><td className={tdCls} colSpan={3}>No monthly drafts waiting.</td></tr>}
              {drafts.map(e => (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-850" onClick={() => onOpen(e)}>
                  <td className={tdCls}><p className="font-semibold text-slate-100">{e.expenseNumber}</p><p className="text-[11px] text-slate-400">{office(e.companyId)} · {e.description}</p></td>
                  <td className={tdCls}>{formatDate(e.date)} {e.date < weekAgo && <Badge variant="rose">Overdue</Badge>}</td>
                  <td className={`${tdCls} text-right font-mono`}>{formatCurrency(e.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-x-auto">
          <p className="px-4 pt-3 text-sm font-bold text-slate-100">Coming up</p>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Template</th><th className={thCls}>Next draft</th><th className={`${thCls} text-right`}>Amount</th></tr></thead>
            <tbody>
              {upcoming.length === 0 && <tr><td className={tdCls} colSpan={3}>No active templates.</td></tr>}
              {upcoming.map(({ t, next }) => (
                <tr key={t.id}>
                  <td className={tdCls}><p className="font-semibold text-slate-100">{t.description}</p><p className="text-[11px] text-slate-400">{office(t.companyId)} · {categories.find(c => c.id === t.categoryId)?.name ?? '—'} · day {t.dayOfMonth}</p></td>
                  <td className={tdCls}>{formatDate(next!)}</td>
                  <td className={`${tdCls} text-right font-mono`}>{formatCurrency(t.amount + t.tax, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4 space-y-2">
        <p className="text-sm font-bold text-slate-100">Templates</p>
        <RecurringExpensesEditor readOnly={editOffices.length === 0} officeIds={companies.filter(c => inScope(c.id)).map(c => c.id)} />
      </div>
    </div>
  );
};
