// Expense workflow (migration 20261112000900_expenses.sql). Approval, posting, payment and the
// monthly drafts all run in the database; these calls pass the user's input. Throws ServiceError.
import { ServiceError, rpcAny, supabase, unwrap } from './core';
import type { RecurringExpense } from './org';

const table = (name: string): any => (supabase as any).from(name);

/** 'Approved' when within the caller's expense limit (posted at once), otherwise 'Pending Approval'. */
export const submitExpense = (id: string) => rpcAny<string>('submit_expense', { p_id: id });

export function reviewExpense(id: string, decision: 'Approved' | 'Rejected' | 'Withdrawn', note?: string) {
  if (decision === 'Rejected' && !note?.trim()) throw new ServiceError('Give a reason for rejecting.');
  return rpcAny<string>('review_expense', { p_id: id, p_decision: decision, p_note: note?.trim() || null });
}

export function payExpense(id: string, bankAccountId: string, date: string) {
  if (!bankAccountId) throw new ServiceError('Choose the bank account the expense was paid from.');
  if (!date) throw new ServiceError('The payment date is required.');
  return rpcAny<string>('pay_expense', { p_id: id, p_bank: bankAccountId, p_date: date });
}

/** Draft or rejected expenses only (enforced by the database). */
export async function deleteExpense(id: string): Promise<void> {
  const rows = await unwrap<{ id: string }[]>(table('expenses').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('The expense was not deleted. You may not have delete rights for this office.');
}

/** Creates the monthly drafts that are due (idempotent). Returns how many were created. */
export const generateRecurringExpenses = (asOf?: string) =>
  rpcAny<number>('generate_recurring_expenses', { p_as_of: asOf || localTodayIso() });
const localTodayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The next date a template will create a draft, or null when it has ended or is inactive. */
export function nextRecurringDate(t: RecurringExpense, today: string): string | null {
  if (!t.active || !t.startDate) return null;
  const [ty, tm] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < 24; i++) {
    const y = ty + Math.floor((tm - 1 + i) / 12);
    const m = ((tm - 1 + i) % 12) + 1;
    const d = `${y}-${pad(m)}-${pad(t.dayOfMonth)}`;
    if (d < t.startDate) continue;
    if (t.endDate && d > t.endDate) return null;
    if (d >= today) return d;
  }
  return null;
}
