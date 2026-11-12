// Server-side queries for the large tables (invoices, payments, expenses, journals, audit logs,
// notifications) and the ledger aggregates. Pages use these instead of loading whole tables:
// lists are paged in the database (DataTable `server` mode) and figures come from aggregate RPCs.
// Every hook is cached through lib/queryCache and invalidated by table name (FleetContext calls
// invalidate() after writes and on realtime events).
import { supabase, toServiceError, num, ymd } from './core';
import { rowToInvoice, rowToPayment, type FinanceInvoice } from './finance';
import { rowToExpense } from './fleet';
import { rowToJournalEntry,
  movementsFromRows, trialBalanceFrom, profitLossFrom, balanceSheetFrom,
  type MovementRow, type Movements, type AnyAccount } from './accounting';
import { useQuery, fetchQuery } from '../lib/queryCache';
import { PAGE_MAX, fetchAllPages, runPage, type ListQuery, type ListPage, type ServerSource, type ListSort } from '../lib/serverList';
import { todayYmd } from '../utils/date';
import type { Payment, JournalEntry } from '../types/finance';
import type { VehicleExpense } from '../types/operations';


type Row = Record<string, any>;
// The generated Database type predates these views and RPCs.
const db = supabase as any;
const officeArg = (companyId?: string | null) => (companyId && companyId !== 'all' ? companyId : null);

/** Call an RPC returning (data jsonb, total_count bigint) rows as one page. */
export async function rpcPage<T>(fn: string, args: Record<string, unknown>, map: (r: Row) => T, signal?: AbortSignal): Promise<ListPage<T>> {
  if (typeof args.p_limit === 'number' && (args.p_limit < 1 || args.p_limit > PAGE_MAX)) throw new Error(`Page size must be between 1 and ${PAGE_MAX}.`);
  let b: any = db.rpc(fn, args);
  if (signal) b = b.abortSignal(signal);
  const { data, error } = await b;
  if (error) throw toServiceError(error);
  const rows = (data ?? []) as { data: Row; total_count: number | string }[];
  return { rows: rows.map(r => map(r.data)), total: rows.length ? num(rows[0].total_count) : 0 };
}

/** Call an RPC and cache the result under `key` (tags = tables read). */
async function rpcData<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw toServiceError(error);
  return data as T;
}

export function useRpc<T>(fn: string, args: Record<string, unknown>, tags: string[], opts: { enabled?: boolean } = {}) {
  const key = `rpc:${fn}:${JSON.stringify(args)}`;
  return useQuery<T>(key, tags, () => rpcData<T>(fn, args), opts);
}

/** Every row of a server source (all pages), e.g. for bulk actions. */
export const fetchAllOf = <T,>(src: ServerSource<T>, onProgress?: (p: { loaded: number; total: number }) => void, signal?: AbortSignal) =>
  fetchAllPages(src.fetch, { search: '', sort: src.defaultSort }, onProgress, signal);

// ---------------------------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------------------------
const INVOICE_TAGS = ['invoices', 'invoice_lines', 'payments', 'companies', 'suppliers', 'customers', 'vehicles'];

/** v_invoice_list row (from invoice_page) → FinanceInvoice. Lines are not included (list rows). */
export const invoiceFromListRow = (r: Row): FinanceInvoice => rowToInvoice({
  ...r,
  company: { name: r.company_name },
  vehicle: r.vehicle_plate ? { plate_number: r.vehicle_plate } : null,
  work_order: r.work_order_number ? { work_order_number: r.work_order_number } : null,
  supplier: r.party_type === 'Supplier' ? { name: r.party_name } : null,
  customer: r.party_type === 'Supplier' ? null : { name: r.party_name },
  lines: [],
});

export interface InvoiceFilter {
  companyId?: string | null;
  view?: 'all' | 'pending' | 'overdue' | 'approval' | 'draft' | 'paid';
  type?: 'Purchase' | 'Sales';
  status?: string;
  approval?: string;
  attachment?: 'with-attachment' | 'no-attachment';
  partyId?: string;
  vehicleId?: string;
  from?: string;
  to?: string;
  parentId?: string;
  openOnly?: boolean;
}

const INVOICE_SORT: Record<string, string> = {
  invoice_number: 'invoice_number', party_name: 'party_name', invoice_date: 'invoice_date', due_date: 'due_date',
  grand_total: 'grand_total', outstanding_amount: 'outstanding_amount', effective_status: 'effective_status',
  attachment_path: 'attachment_path', created_at: 'created_at', invoice_type: 'invoice_type',
};

export function fetchInvoicePage(f: InvoiceFilter, q: ListQuery, signal?: AbortSignal): Promise<ListPage<FinanceInvoice>> {
  const sort = q.sort ?? { column: 'invoice_date', ascending: false };
  return rpcPage('invoice_page', {
    p_company: officeArg(f.companyId), p_view: f.view ?? 'all', p_type: f.type ?? null, p_status: f.status ?? null,
    p_approval: f.approval ?? null, p_attachment: f.attachment ?? null, p_search: q.search || null,
    p_sort: INVOICE_SORT[sort.column] ?? 'invoice_date', p_ascending: sort.ascending,
    p_limit: q.limit, p_offset: q.offset, p_today: todayYmd(),
    p_party: f.partyId ?? null, p_vehicle: f.vehicleId ?? null, p_from: f.from || null, p_to: f.to || null,
    p_parent: f.parentId ?? null, p_open_only: !!f.openOnly,
  }, invoiceFromListRow, signal);
}

export const invoiceSource = (f: InvoiceFilter): ServerSource<FinanceInvoice> => ({
  key: `invoices:${JSON.stringify(f)}`,
  tags: INVOICE_TAGS,
  fetch: (q, signal) => fetchInvoicePage(f, q, signal),
  defaultSort: { column: 'invoice_date', ascending: false },
});

export interface InvoiceSummary {
  count_all: number; count_pending: number; count_overdue: number; count_approval: number; count_draft: number;
  count_paid: number; count_with_attachment: number;
  purchase_total: number; sales_total: number; ap_outstanding: number; ar_outstanding: number;
  aging_ap: number[]; aging_ar: number[];
  top_parties: { name: string; type: string; count: number; total: number }[];
  fo_receivables: number; fo_payables: number; fo_overdue_sales: number;
  open_purchase_count: number; open_purchase_outstanding: number;
  by_office: { company_id: string; ar_open: number; ap_open: number; ap_open_count: number; ar_overdue_count: number; ar_overdue_sum: number; pending_approval: number }[];
}

const numify = (v: any): any => Array.isArray(v) ? v.map(numify)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && k !== 'name' && k !== 'type' && k !== 'company_id' && x !== '' && !isNaN(Number(x)) ? Number(x) : numify(x)]))
  : v;

export function useInvoiceSummary(companyId?: string | null, opts: { enabled?: boolean } = {}) {
  const args = { p_company: officeArg(companyId), p_today: todayYmd() };
  const q = useRpc<InvoiceSummary>('invoice_summary', args, INVOICE_TAGS, opts);
  return { ...q, data: q.data ? numify(q.data) as InvoiceSummary : undefined };
}

// ---------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------
const PAYMENT_TAGS = ['payments', 'invoices', 'bank_accounts', 'companies'];
export const paymentFromListRow = (r: Row): Payment => rowToPayment({
  ...r,
  invoice: { invoice_number: r.invoice_number, invoice_type: r.invoice_type, party_type: r.party_type,
             supplier_id: r.supplier_id, customer_id: r.customer_id, party_snapshot: { name: r.party_name } },
  bank: { account_name: r.bank_account_name, bank_name: r.bank_name },
});

export interface PaymentFilter { companyId?: string | null; invoiceId?: string; bankAccountId?: string; partyId?: string; from?: string; to?: string; type?: 'Purchase' | 'Sales' }

const applyPaymentFilter = (b: any, f: PaymentFilter) => {
  if (officeArg(f.companyId)) b = b.eq('company_id', f.companyId);
  if (f.invoiceId) b = b.eq('invoice_id', f.invoiceId);
  if (f.bankAccountId) b = b.eq('bank_account_id', f.bankAccountId);
  if (f.partyId) b = b.or(`supplier_id.eq.${f.partyId},customer_id.eq.${f.partyId}`);
  if (f.type) b = b.eq('invoice_type', f.type);
  if (f.from) b = b.gte('payment_date', f.from);
  if (f.to) b = b.lte('payment_date', f.to);
  return b;
};

export const paymentSource = (f: PaymentFilter): ServerSource<Payment> => ({
  key: `payments:${JSON.stringify(f)}`,
  tags: PAYMENT_TAGS,
  defaultSort: { column: 'payment_date', ascending: false },
  fetch: (q, signal) => {
    return runPage<Row, Payment>(() => applyPaymentFilter(db.from('v_payment_list').select('*', { count: 'exact' }), f),
      q, paymentFromListRow, { searchColumn: 'search_text', defaultSort: { column: 'payment_date', ascending: false }, tieBreaker: 'id', signal });
  },
});

// ---------------------------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------------------------
const EXPENSE_TAGS = ['expenses', 'vehicles', 'suppliers', 'employees'];
export const expenseFromListRow = (r: Row): VehicleExpense => rowToExpense({
  ...r,
  vehicle: r.vehicle_plate ? { plate_number: r.vehicle_plate } : null,
  supplier: r.supplier_name ? { name: r.supplier_name } : null,
  employee: r.employee_name ? { name: r.employee_name } : null,
});

/** Same keys as expense_matches() in the database. */
export interface ExpenseFilter {
  company?: string | null; category?: string; status?: string; vehicle?: string; employee?: string; supplier?: string;
  from?: string; to?: string; receipt?: 'with-receipt' | 'no-receipt'; recurring?: boolean; search?: string;
  cf?: { key: string; type: string; value?: string; to?: string };
}
const cleanExpenseFilter = (f: ExpenseFilter) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '' && v !== 'all') out[k] = v;
  if (out.company && !officeArg(out.company as string)) delete out.company;
  return out;
};

export const expenseSource = (f: ExpenseFilter): ServerSource<VehicleExpense> => ({
  key: `expenses:${JSON.stringify(cleanExpenseFilter(f))}`,
  tags: EXPENSE_TAGS,
  defaultSort: { column: 'date', ascending: false },
  fetch: (q, signal) => {
    const sort = q.sort ?? { column: 'date', ascending: false };
    return rpcPage('expense_page', {
      p_filter: { ...cleanExpenseFilter(f), ...(q.search ? { search: q.search } : {}) },
      p_sort: sort.column, p_ascending: sort.ascending, p_limit: q.limit, p_offset: q.offset,
    }, expenseFromListRow, signal);
  },
});

export interface ExpenseSummary {
  fuel_total: number; approved_total: number; pending_count: number; unpaid_count: number; draft_count: number;
  receipts_count: number; categories: string[]; filtered_total: number; by_category: [string, number][];
}
export function useExpenseSummary(f: ExpenseFilter) {
  const q = useRpc<ExpenseSummary>('expense_summary', { p_filter: cleanExpenseFilter(f) }, EXPENSE_TAGS);
  const d = q.data;
  return { ...q, data: d ? { ...numify(d), categories: d.categories ?? [], by_category: (d.by_category ?? []).map(([c, t]) => [c, num(t)] as [string, number]) } as ExpenseSummary : undefined };
}

export interface ExpenseTotalRow { company_id: string | null; vehicle_id: string | null; category: string | null; count: number; net: number; tax: number; total: number }
export function useExpenseTotals(f: ExpenseFilter, group: 'category' | 'office' | 'office_category' | 'vehicle', opts: { enabled?: boolean } = {}) {
  const q = useRpc<Row[]>('expense_totals', { p_filter: cleanExpenseFilter(f), p_group: group }, EXPENSE_TAGS, opts);
  return { ...q, data: q.data?.map(r => ({ ...r, count: num(r.count), net: num(r.net), tax: num(r.tax), total: num(r.total) }) as ExpenseTotalRow) };
}

// ---------------------------------------------------------------------------------------------
// Journals
// ---------------------------------------------------------------------------------------------
const JOURNAL_TAGS = ['journal_entries', 'journal_lines', 'chart_of_accounts'];
export interface JournalFilter { companyId?: string | null; status?: string; source?: string; from?: string; to?: string; sourceId?: string }
export const journalSource = (f: JournalFilter): ServerSource<JournalEntry & { totalDebit: number; totalCredit: number }> => ({
  key: `journals:${JSON.stringify(f)}`,
  tags: JOURNAL_TAGS,
  defaultSort: { column: 'date', ascending: false },
  fetch: (q, signal) => {
    return runPage<Row, JournalEntry & { totalDebit: number; totalCredit: number }>(() => {
      let b: any = db.from('v_journal_list').select('*, lines:journal_lines(*, vehicle:vehicles(plate_number))', { count: 'exact' });
      if (officeArg(f.companyId)) b = b.eq('company_id', f.companyId);
      if (f.status) b = b.eq('status', f.status);
      if (f.source) b = b.eq('source_module', f.source);
      if (f.sourceId) b = b.eq('source_id', f.sourceId);
      if (f.from) b = b.gte('date', f.from);
      if (f.to) b = b.lte('date', f.to);
      return b;
    }, q, r => ({ ...rowToJournalEntry({ ...r, poster: { name: r.posted_by_name } }), totalDebit: num(r.total_debit), totalCredit: num(r.total_credit) }),
    { searchColumn: 'search_text', defaultSort: { column: 'date', ascending: false }, tieBreaker: 'entry_number', signal });
  },
});

// ---------------------------------------------------------------------------------------------
// Ledger aggregates (trial balance, P&L, balance sheet) from ledger_movements()
// ---------------------------------------------------------------------------------------------
export function useLedgerMovementRows(companyId?: string | null, from?: string, to?: string, opts: { enabled?: boolean } = {}) {
  const q = useRpc<MovementRow[]>('ledger_movements', { p_company: officeArg(companyId), p_from: from || null, p_to: to || null }, JOURNAL_TAGS, opts);
  return q;
}
export function useMovements(companyId?: string | null, from?: string, to?: string, opts: { enabled?: boolean } = {}) {
  const q = useLedgerMovementRows(companyId, from, to, opts);
  const data: Movements | undefined = q.data ? movementsFromRows(q.data, officeArg(companyId) ?? undefined) : undefined;
  return { ...q, data };
}

export function useTrialBalance(accounts: AnyAccount[], asOf: string | undefined, companyId?: string | null) {
  const q = useMovements(companyId, undefined, asOf);
  return { ...q, data: q.data ? trialBalanceFrom(accounts, q.data, officeArg(companyId) ?? undefined) : undefined };
}
export function useProfitLoss(accounts: AnyAccount[], companyId: string | null | undefined, range: { startDate?: string; endDate?: string } = {}, opts: { enabled?: boolean } = {}) {
  const q = useMovements(companyId, range.startDate, range.endDate, opts);
  return { ...q, data: q.data ? profitLossFrom(accounts, q.data, officeArg(companyId) ?? undefined, range) : undefined };
}
/** P&L per office from one ledger_movements call over all offices. */
export function useProfitLossByOffice(accounts: AnyAccount[], companyIds: string[], range: { startDate?: string; endDate?: string } = {}, opts: { enabled?: boolean } = {}) {
  const q = useLedgerMovementRows(null, range.startDate, range.endDate, opts);
  const data = q.data ? new Map(companyIds.map(id => [id, profitLossFrom(accounts, movementsFromRows(q.data!, id), id, range)])) : undefined;
  return { ...q, data };
}
export function useBalanceSheet(accounts: AnyAccount[], companyId: string | null | undefined, asOf: string) {
  const q = useMovements(companyId, undefined, asOf);
  return { ...q, data: q.data ? balanceSheetFrom(accounts, q.data, officeArg(companyId) ?? undefined, asOf) : undefined };
}

export interface GeneralLedgerRow {
  line_id: string; entry_id: string; entry_number: string; date: string; reference: string | null; description: string | null;
  source_module: string | null; vehicle_plate: string | null; cost_centre: string | null; company_id: string;
  debit: number; credit: number; running_balance: number; total_count: number; opening_balance?: number;
}
export async function fetchGeneralLedgerPage(companyId: string | null | undefined, account: string, from: string | undefined, to: string | undefined,
  limit: number, offset: number): Promise<GeneralLedgerRow[]> {
  const { data, error } = await db.rpc('general_ledger_page', {
    p_company: officeArg(companyId), p_account: account, p_from: from || null, p_to: to || null, p_limit: limit, p_offset: offset,
  });
  if (error) throw toServiceError(error);
  return ((data ?? []) as Row[]).map(r => ({ ...r, date: ymd(r.date), debit: num(r.debit), credit: num(r.credit),
    running_balance: num(r.running_balance), total_count: num(r.total_count) } as GeneralLedgerRow));
}

// ---------------------------------------------------------------------------------------------
// Dashboard series
// ---------------------------------------------------------------------------------------------
export interface DaySeries { day: string; sales: number; expenses: number; maintenance: number }
export function useDashboardSeries(companyId: string | null | undefined, from: string, to: string, opts: { enabled?: boolean } = {}) {
  const q = useRpc<Row[]>('dashboard_series', { p_company: officeArg(companyId), p_from: from, p_to: to }, ['invoices', 'expenses', 'maintenance_records'], opts);
  return { ...q, data: q.data?.map(r => ({ day: ymd(r.day), sales: num(r.sales), expenses: num(r.expenses), maintenance: num(r.maintenance) })) as DaySeries[] | undefined };
}

/** Prefetch helper for tests and warm-up. */
export const prefetch = <T,>(key: string, tags: string[], fn: () => Promise<T>) => fetchQuery(key, tags, fn);
export type { ListSort };
