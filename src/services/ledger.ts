// Finance controls (migration 20261112000800_finance.sql): period lock, journal requests, debit
// notes, bank reconciliation, cash flow statement, budgets, asset disposal. All posting happens in
// the database; these calls only pass the user's input. Every function throws ServiceError.
import { ServiceError, num, nul, rpcAny, supabase, unwrap, unwrapOne, ymd } from './core';

type Row = Record<string, any>;
const table = (name: string): any => (supabase as any).from(name);

// ---------------------------------------------------------------- period lock
export interface AccountingPeriod { companyId: string; year: number; month: number; status: 'Open' | 'Closed'; closedAt: string | null; reopenedAt: string | null; note: string }
export async function fetchPeriods(): Promise<AccountingPeriod[]> {
  const rows = await unwrap<Row[]>(table('accounting_periods').select('company_id, year, month, status, closed_at, reopened_at, note').order('year', { ascending: false }).order('month', { ascending: false }));
  return (rows ?? []).map(r => ({ companyId: r.company_id, year: r.year, month: r.month, status: r.status, closedAt: r.closed_at, reopenedAt: r.reopened_at, note: r.note ?? '' }));
}
export const closePeriod = (companyId: string, year: number, month: number, note?: string) =>
  rpcAny('close_period', { p_company: companyId, p_year: year, p_month: month, p_note: note ?? null });
export function reopenPeriod(companyId: string, year: number, month: number, reason: string) {
  if (!reason.trim()) throw new ServiceError('A reason is required to reopen a period.');
  return rpcAny('reopen_period', { p_company: companyId, p_year: year, p_month: month, p_reason: reason.trim() });
}

// ---------------------------------------------------------------- journal requests
export interface JournalRequestLine { account_code: string; debit?: number; credit?: number; description?: string | null }
export interface JournalRequest {
  id: string; companyId: string; requestNumber: string; entryDate: string; description: string; reference: string;
  lines: JournalRequestLine[]; total: number; status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  requestedBy: string | null; requestedByName: string; reviewNote: string; createdAt: string;
}
export async function fetchJournalRequests(status?: 'Pending'): Promise<JournalRequest[]> {
  let q = table('journal_requests').select('*, requester:profiles!journal_requests_requested_by_fkey(name)').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const rows = await unwrap<Row[]>(q);
  return (rows ?? []).map(r => ({
    id: r.id, companyId: r.company_id, requestNumber: r.request_number, entryDate: ymd(r.entry_date), description: r.description,
    reference: r.reference ?? '', lines: r.lines ?? [], total: num(r.total), status: r.status, requestedBy: r.requested_by ?? null,
    requestedByName: r.requester?.name ?? '', reviewNote: r.review_note ?? '', createdAt: r.created_at,
  }));
}
export const reviewJournalRequest = (id: string, decision: 'Approved' | 'Rejected' | 'Cancelled', note?: string) =>
  rpcAny<string | null>('review_manual_journal', { p_id: id, p_decision: decision, p_note: note ?? null });

// ---------------------------------------------------------------- debit notes
export interface DebitNoteLine { description: string; quantity: number; unitPrice: number; taxRate: number; glAccountCode?: string }
export async function createDebitNote(invoiceId: string, reason: string, lines: DebitNoteLine[]): Promise<string> {
  if (!reason.trim()) throw new ServiceError('A reason is required for a debit note.');
  const valid = lines.filter(l => l.description.trim() && l.quantity > 0 && l.unitPrice > 0);
  if (!valid.length) throw new ServiceError('Add at least one line with a description, quantity and price.');
  return rpcAny<string>('create_debit_note', {
    p_invoice: invoiceId, p_reason: reason.trim(),
    p_lines: valid.map(l => ({ description: l.description.trim(), quantity: l.quantity, unit_price: l.unitPrice, tax_rate_percentage: l.taxRate, gl_account_code: l.glAccountCode || null })),
  });
}

// ---------------------------------------------------------------- bank reconciliation
export interface BankStatement {
  id: string; companyId: string; bankAccountId: string; periodStart: string; periodEnd: string; openingBalance: number;
  closingBalance: number; status: 'Open' | 'Reconciled'; notes: string; reconciledAt: string | null;
}
const rowToStatement = (r: Row): BankStatement => ({
  id: r.id, companyId: r.company_id, bankAccountId: r.bank_account_id, periodStart: ymd(r.period_start), periodEnd: ymd(r.period_end),
  openingBalance: num(r.opening_balance), closingBalance: num(r.closing_balance), status: r.status, notes: r.notes ?? '', reconciledAt: r.reconciled_at ?? null,
});
export async function fetchBankStatements(bankAccountId: string): Promise<BankStatement[]> {
  const rows = await unwrap<Row[]>(table('bank_statements').select('*').eq('bank_account_id', bankAccountId).order('period_end', { ascending: false }));
  return (rows ?? []).map(rowToStatement);
}
export interface StatementInput { companyId: string; bankAccountId: string; periodStart: string; periodEnd: string; openingBalance: number; closingBalance: number; notes?: string }
export async function createBankStatement(v: StatementInput): Promise<BankStatement> {
  if (!v.periodStart || !v.periodEnd || v.periodEnd < v.periodStart) throw new ServiceError('Choose a valid statement period.');
  const row = await unwrapOne<Row>(table('bank_statements').insert({
    company_id: v.companyId, bank_account_id: v.bankAccountId, period_start: v.periodStart, period_end: v.periodEnd,
    opening_balance: v.openingBalance, closing_balance: v.closingBalance, notes: nul(v.notes),
  }).select('*').single());
  return rowToStatement(row);
}
export async function deleteBankStatement(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('bank_statements').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('You cannot delete this statement.');
}

export interface StatementLine { id: string; statementId: string; txnDate: string; description: string; reference: string; amount: number; journalLineId: string | null }
const rowToLine = (r: Row): StatementLine => ({
  id: r.id, statementId: r.statement_id, txnDate: ymd(r.txn_date), description: r.description, reference: r.reference ?? '', amount: num(r.amount), journalLineId: r.journal_line_id ?? null,
});
export async function fetchStatementLines(statementId: string): Promise<StatementLine[]> {
  const rows = await unwrap<Row[]>(table('bank_statement_lines').select('*').eq('statement_id', statementId).order('txn_date'));
  return (rows ?? []).map(rowToLine);
}
export interface StatementLineInput { txnDate: string; description: string; reference?: string; amount: number }
export function validateStatementLine(l: StatementLineInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.txnDate)) return 'Date must be YYYY-MM-DD.';
  if (!l.description.trim()) return 'Description is required.';
  if (!Number.isFinite(l.amount) || l.amount === 0) return 'Amount must be a non-zero number (money out is negative).';
  return null;
}
export async function addStatementLines(statement: BankStatement, lines: StatementLineInput[]): Promise<void> {
  for (const l of lines) { const e = validateStatementLine(l); if (e) throw new ServiceError(e); }
  if (!lines.length) return;
  await unwrap(table('bank_statement_lines').insert(lines.map(l => ({
    statement_id: statement.id, company_id: statement.companyId, txn_date: l.txnDate, description: l.description.trim(), reference: nul(l.reference), amount: l.amount,
  }))));
}
export async function deleteStatementLine(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('bank_statement_lines').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('You cannot delete this line.');
}
export async function matchStatementLine(id: string, journalLineId: string | null): Promise<void> {
  await unwrap(table('bank_statement_lines').update({ journal_line_id: journalLineId }).eq('id', id));
}
export interface BookLine { journalLineId: string; entryDate: string; entryNumber: string; description: string; amount: number; statementLineId: string | null; statementId: string | null }
export async function fetchBookLines(bankAccountId: string, from: string, to: string): Promise<BookLine[]> {
  const rows = await rpcAny<Row[]>('bank_book_lines', { p_bank: bankAccountId, p_from: from, p_to: to });
  return (rows ?? []).map(r => ({
    journalLineId: r.journal_line_id, entryDate: ymd(r.entry_date), entryNumber: r.entry_number, description: r.description ?? '',
    amount: num(r.amount), statementLineId: r.statement_line_id ?? null, statementId: r.statement_id ?? null,
  }));
}
export const autoMatchStatement = (id: string) => rpcAny<number>('auto_match_statement', { p_statement: id });
export const completeReconciliation = (id: string) => rpcAny('complete_bank_reconciliation', { p_statement: id });

// ---------------------------------------------------------------- cash flow
export interface CashFlowRow { section: string; line: string; amount: number; sort: number }
export async function fetchCashFlow(companyId: string, from: string, to: string): Promise<CashFlowRow[]> {
  const rows = await rpcAny<Row[]>('cash_flow_statement', { p_company: companyId, p_from: from, p_to: to });
  return (rows ?? []).map(r => ({ section: r.section, line: r.line, amount: num(r.amount), sort: Number(r.sort) }));
}

// ---------------------------------------------------------------- budgets
export type BudgetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
export interface Budget {
  id: string; companyId: string; year: number; name: string; status: BudgetStatus; notes: string; submittedBy: string | null;
  reviewNote: string; lines: { id: string; accountCode: string; month: number; amount: number }[];
}
export async function fetchBudgets(year: number): Promise<Budget[]> {
  const rows = await unwrap<Row[]>(table('budgets').select('*, lines:budget_lines(id, account_code, month, amount)').eq('year', year).order('name'));
  return (rows ?? []).map(r => ({
    id: r.id, companyId: r.company_id, year: r.year, name: r.name, status: r.status, notes: r.notes ?? '', submittedBy: r.submitted_by ?? null,
    reviewNote: r.review_note ?? '', lines: (r.lines ?? []).map((l: Row) => ({ id: l.id, accountCode: l.account_code, month: l.month, amount: num(l.amount) })),
  }));
}
export async function createBudget(v: { companyId: string; year: number; name: string; notes?: string }): Promise<string> {
  if (!v.name.trim()) throw new ServiceError('Name the budget.');
  const row = await unwrapOne<Row>(table('budgets').insert({ company_id: v.companyId, year: v.year, name: v.name.trim(), notes: nul(v.notes) }).select('id').single());
  return row.id;
}
export async function deleteBudget(id: string): Promise<void> {
  const rows = await unwrap<Row[]>(table('budgets').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new ServiceError('Only draft or rejected budgets can be deleted.');
}
/** Replaces one account's 12 monthly amounts (zero months are removed). */
export async function saveBudgetAccount(budget: Budget, accountCode: string, months: number[]): Promise<void> {
  if (months.length !== 12 || months.some(m => !(m >= 0))) throw new ServiceError('Enter 12 monthly amounts of zero or more.');
  await unwrap(table('budget_lines').delete().eq('budget_id', budget.id).eq('account_code', accountCode));
  const rows = months.map((amount, i) => ({ amount, month: i + 1 })).filter(x => x.amount > 0);
  if (rows.length) {
    await unwrap(table('budget_lines').insert(rows.map(x => ({ budget_id: budget.id, company_id: budget.companyId, account_code: accountCode, month: x.month, amount: x.amount }))));
  }
}
export const submitBudget = (id: string) => rpcAny('submit_budget', { p_budget: id });
export const reviewBudget = (id: string, decision: 'Approved' | 'Rejected' | 'Reopen', note?: string) =>
  rpcAny('review_budget', { p_budget: id, p_decision: decision, p_note: note ?? null });
export interface BudgetActual { accountCode: string; accountName: string; category: string; month: number; budget: number; actual: number }
export async function fetchBudgetVsActual(companyId: string, year: number): Promise<BudgetActual[]> {
  const rows = await rpcAny<Row[]>('budget_vs_actual', { p_company: companyId, p_year: year });
  return (rows ?? []).map(r => ({ accountCode: r.account_code, accountName: r.account_name, category: r.category, month: Number(r.month), budget: num(r.budget), actual: num(r.actual) }));
}

// ---------------------------------------------------------------- asset disposal
export function disposeFixedAsset(assetId: string, date: string, proceeds: number, bankAccountId: string | null, note: string) {
  if (!date) throw new ServiceError('The disposal date is required.');
  if (!(proceeds >= 0)) throw new ServiceError('Proceeds cannot be negative.');
  if (proceeds > 0 && !bankAccountId) throw new ServiceError('Choose the bank account that received the proceeds.');
  return rpcAny<string | null>('dispose_fixed_asset', { p_asset: assetId, p_date: date, p_proceeds: proceeds, p_bank_account: bankAccountId, p_note: note || null });
}
