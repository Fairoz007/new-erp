// Server-side queries for the ledger and system pages: general ledger (summary + paged lines),
// party statement, notifications, audit log, office record counts and the JSON data export.
// Database objects: migrations 20261113000000_advance_data_layer.sql and
// 20261113000400_advance_ledger_system.sql. Figures reuse the pure functions in accounting.ts /
// finance.ts so their definitions cannot drift.
import { supabase, toServiceError, num } from './core';
import { accountBalancesFrom, rowToJournalEntry, type AnyAccount, type Movements } from './accounting';
import { getPartyLedger, rowToInvoice, type FinanceInvoice } from './finance';
import { rowToNotification, rowToAuditLog } from './system';
import { fetchGeneralLedgerPage, paymentFromListRow } from './queries';
import { useQuery } from '../lib/queryCache';
import { PAGE_MAX, fetchAllPages, runPage, type FetchAllProgress, type ListPage, type ServerSource } from '../lib/serverList';
import type { GeneralLedgerLine, JournalEntry, Payment } from '../types/finance';
import type { AuditLog, NotificationItem } from '../types/system';

type Row = Record<string, any>;
const db = supabase as any;
const officeArg = (companyId?: string | null) => (companyId && companyId !== 'all' ? companyId : null);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const JOURNAL_TAGS = ['journal_entries', 'journal_lines', 'chart_of_accounts', 'accounts'];

// ---------------------------------------------------------------------------------------------
// General ledger
// ---------------------------------------------------------------------------------------------
export interface GlAccountSummary {
  accountCode: string; accountName: string; category: string; subcategory: string; currency: string;
  openingBalance: number; totalDebit: number; totalCredit: number; closingBalance: number; lineCount: number;
}

/**
 * One row per account in scope (all accounts, or the chosen code): opening = opening balance +
 * posted movements before startDate; totals and line count in [startDate, endDate];
 * closing = opening + period movement in the account's normal direction (as getGeneralLedger).
 */
export function useGeneralLedgerSummary(accounts: AnyAccount[], companyId: string | null | undefined, accountCode: string,
  startDate: string | undefined, endDate: string | undefined, currency: string) {
  const args = { p_company: officeArg(companyId), p_from: startDate || null, p_to: endDate || null };
  const q = useQuery<Row[]>(`gl-summary:${JSON.stringify(args)}`, JOURNAL_TAGS, async () => {
    const { data, error } = await db.rpc('general_ledger_summary', args);
    if (error) throw toServiceError(error);
    return (data ?? []) as Row[];
  });
  let data: GlAccountSummary[] | undefined;
  if (q.data) {
    const before: Movements = new Map(), inRange: Movements = new Map(), counts = new Map<string, number>();
    for (const r of q.data) {
      before.set(r.account_code, { dr: num(r.before_debit), cr: num(r.before_credit) });
      inRange.set(r.account_code, { dr: num(r.debit), cr: num(r.credit) });
      counts.set(r.account_code, num(r.line_count));
    }
    const scope = officeArg(companyId) ?? undefined;
    const move = new Map(accountBalancesFrom(accounts, inRange, scope, false).map(b => [b.account.code, b.balance]));
    data = accountBalancesFrom(accounts, before, scope, true)
      .filter(b => !accountCode || accountCode === 'all' || b.account.code === accountCode)
      .map(({ account: a, balance: opening }) => {
        const m = inRange.get(a.code) ?? { dr: 0, cr: 0 };
        return {
          accountCode: a.code, accountName: a.name, category: a.category, subcategory: a.subcategory,
          currency: a.currency || currency, openingBalance: opening, totalDebit: r3(m.dr), totalCredit: r3(m.cr),
          closingBalance: r3(opening + (move.get(a.code) ?? 0)), lineCount: counts.get(a.code) ?? 0,
        };
      });
  }
  return { ...q, data };
}

const glLine = (r: Awaited<ReturnType<typeof fetchGeneralLedgerPage>>[number]): GeneralLedgerLine => ({
  id: r.line_id, entryNumber: r.entry_number, date: r.date, reference: r.reference ?? undefined,
  description: r.description ?? '', sourceModule: r.source_module ?? 'Manual',
  vehiclePlate: r.vehicle_plate ?? undefined, costCentre: r.cost_centre ?? undefined,
  debit: r.debit, credit: r.credit, runningBalance: r.running_balance,
});

/** The first `count` lines of one account (running balance from the database), ≤ PAGE_MAX per request. */
export async function fetchLedgerLines(companyId: string | null | undefined, accountCode: string, startDate: string | undefined,
  endDate: string | undefined, count: number, onProgress?: (p: FetchAllProgress) => void, signal?: AbortSignal): Promise<GeneralLedgerLine[]> {
  const out: GeneralLedgerLine[] = [];
  while (out.length < count) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const limit = Math.min(PAGE_MAX, count - out.length);
    const rows = await fetchGeneralLedgerPage(companyId, accountCode, startDate, endDate, limit, out.length);
    out.push(...rows.map(glLine));
    onProgress?.({ loaded: out.length, total: rows[0]?.total_count ?? out.length });
    if (rows.length < limit) break;
  }
  return out;
}

export function useLedgerLines(companyId: string | null | undefined, accountCode: string, startDate: string | undefined,
  endDate: string | undefined, count: number, enabled: boolean) {
  const key = `gl-lines:${officeArg(companyId)}:${accountCode}:${startDate ?? ''}:${endDate ?? ''}:${count}`;
  return useQuery(key, JOURNAL_TAGS, () => fetchLedgerLines(companyId, accountCode, startDate, endDate, count), { enabled });
}

// ---------------------------------------------------------------------------------------------
// Party statement (one supplier / customer): its approved documents and payments, page by page
// ---------------------------------------------------------------------------------------------
const STATEMENT_INVOICE_SELECT = 'id, invoice_number, invoice_type, company_id, party_type, supplier_id, customer_id, party_snapshot, invoice_date, due_date, grand_total, subtotal, discount_total, tax_total, other_charges, amount_paid, outstanding_amount, credited_amount, payment_status, approval_status, is_credit_note, is_debit_note, notes, currency, created_at, updated_at, lines:invoice_lines(id, line_no)';

export function usePartyStatement(partyId: string, partyType: 'Supplier' | 'Customer',
  parties: { id: string; openingBalance: number }[], companyId: string | null | undefined) {
  const scope = officeArg(companyId);
  const key = `party-statement:${partyType}:${partyId}:${scope}`;
  const q = useQuery<{ invoices: FinanceInvoice[]; payments: Payment[] }>(key,
    ['invoices', 'invoice_lines', 'payments', 'suppliers', 'customers'], async () => {
      const partyCol = partyType === 'Supplier' ? 'supplier_id' : 'customer_id';
      const invoices = await fetchAllPages<FinanceInvoice>((lq, signal) => runPage<Row, FinanceInvoice>(() => {
        let b: any = db.from('invoices').select(STATEMENT_INVOICE_SELECT, { count: 'exact' })
          .eq(partyCol, partyId).eq('party_type', partyType).eq('approval_status', 'Approved').neq('payment_status', 'Cancelled');
        if (scope) b = b.eq('company_id', scope);
        return b;
      }, lq, rowToInvoice, { defaultSort: { column: 'invoice_date', ascending: true }, tieBreaker: 'id', signal }), { search: '' });
      const payments = await fetchAllPages<Payment>((lq, signal) => runPage<Row, Payment>(() => {
        let b: any = db.from('v_payment_list').select('*', { count: 'exact' }).eq(partyCol, partyId).eq('party_type', partyType);
        if (scope) b = b.eq('company_id', scope);
        return b;
      }, lq, paymentFromListRow, { defaultSort: { column: 'payment_date', ascending: true }, tieBreaker: 'id', signal }), { search: '' });
      return { invoices, payments };
    }, { enabled: !!partyId });
  const data = q.data && partyId
    ? getPartyLedger(partyId, partyType, q.data.invoices, q.data.payments, parties, scope ?? undefined)
    : undefined;
  return { ...q, data };
}

// ---------------------------------------------------------------------------------------------
// Notifications (the caller's, with read state)
// ---------------------------------------------------------------------------------------------
export const NOTIFICATION_TAGS = ['notifications', 'notification_reads'];
export type NotificationFilter = 'all' | 'unread' | 'critical';
const notificationFromRow = (r: Row): NotificationItem => rowToNotification({ ...r, notification_reads: r.is_read ? [{}] : [] });

export function fetchNotificationPage(filter: NotificationFilter, offset: number, limit: number, signal?: AbortSignal): Promise<ListPage<NotificationItem>> {
  return runPage<Row, NotificationItem>(() => {
    let b: any = db.from('v_notification_list').select('*', { count: 'exact' });
    if (filter === 'unread') b = b.eq('is_read', false);
    if (filter === 'critical') b = b.eq('severity', 'critical');
    return b;
  }, { offset, limit, search: '' }, notificationFromRow, { defaultSort: { column: 'created_at', ascending: false }, tieBreaker: 'id', signal });
}

/** The newest `shown` notifications for a filter (several requests when shown > PAGE_MAX). */
export function useNotificationFeed(filter: NotificationFilter, shown: number, opts: { enabled?: boolean } = {}) {
  return useQuery<ListPage<NotificationItem>>(`notifications:${filter}:${shown}`, NOTIFICATION_TAGS, async () => {
    const rows: NotificationItem[] = [];
    let total = 0;
    while (rows.length < shown) {
      const limit = Math.min(PAGE_MAX, shown - rows.length);
      const page = await fetchNotificationPage(filter, rows.length, limit);
      rows.push(...page.rows); total = page.total;
      if (page.rows.length < limit) break;
    }
    return { rows, total };
  }, opts);
}

export interface NotificationCounts { total: number; unread: number; critical: number }
export function useNotificationCounts(opts: { enabled?: boolean } = {}) {
  const q = useQuery<NotificationCounts>('notification_counts', NOTIFICATION_TAGS, async () => {
    const { data, error } = await db.rpc('notification_counts');
    if (error) throw toServiceError(error);
    return { total: num(data?.total), unread: num(data?.unread), critical: num(data?.critical) };
  }, opts);
  return q;
}

// ---------------------------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------------------------
export interface AuditFilter { companyId?: string | null; action?: string }
export const auditLogSource = (f: AuditFilter): ServerSource<AuditLog> => ({
  key: `audit_logs:${JSON.stringify(f)}`,
  tags: ['audit_logs'],
  defaultSort: { column: 'occurred_at', ascending: false },
  fetch: (q, signal) => runPage<Row, AuditLog>(() => {
    let b: any = db.from('v_audit_log_list').select('*', { count: 'exact' });
    // one office selected: its rows plus organization-level rows (users, roles, settings)
    const office = officeArg(f.companyId);
    if (office) b = b.or(`company_id.eq.${office},company_id.is.null`);
    if (f.action) b = b.eq('display_action', f.action);
    return b;
  }, q, rowToAuditLog, { searchColumn: 'search_text', defaultSort: { column: 'occurred_at', ascending: false }, tieBreaker: 'id', signal }),
});

// ---------------------------------------------------------------------------------------------
// Offices: records per office
// ---------------------------------------------------------------------------------------------
export interface OfficeCounts { vehicles: number; employees: number; invoices: number }
export function useOfficeRecordCounts() {
  const q = useQuery<Row[]>('office_record_counts', ['companies', 'vehicles', 'employees', 'invoices'], async () => {
    const { data, error } = await db.rpc('office_record_counts');
    if (error) throw toServiceError(error);
    return (data ?? []) as Row[];
  });
  const data = q.data
    ? new Map<string, OfficeCounts>(q.data.map(r => [r.company_id, { vehicles: num(r.vehicles), employees: num(r.employees), invoices: num(r.invoices) }]))
    : undefined;
  return { ...q, data };
}

// ---------------------------------------------------------------------------------------------
// JSON data export: the large tables, page by page (documents with their lines in smaller pages)
// ---------------------------------------------------------------------------------------------
const EXPORT_INVOICE_SELECT = `*,
  company:companies(name),
  vehicle:vehicles(plate_number),
  work_order:work_orders(work_order_number),
  supplier:suppliers(name, vat_number, address, email, phone),
  customer:customers(name, vat_number, address, email, phone),
  lines:invoice_lines(*, vehicle:vehicles(plate_number))`;
const WITH_LINES_PAGE = 200;

export const fetchAllInvoicesForExport = (onProgress?: (p: FetchAllProgress) => void, signal?: AbortSignal) =>
  fetchAllPages<FinanceInvoice>((lq, s) => runPage<Row, FinanceInvoice>(
    () => db.from('invoices').select(EXPORT_INVOICE_SELECT, { count: 'exact' }),
    lq, rowToInvoice, { defaultSort: { column: 'invoice_date', ascending: false }, tieBreaker: 'id', signal: s }),
  { search: '' }, onProgress, signal, WITH_LINES_PAGE);

export const fetchAllJournalsForExport = (onProgress?: (p: FetchAllProgress) => void, signal?: AbortSignal) =>
  fetchAllPages<JournalEntry>((lq, s) => runPage<Row, JournalEntry>(
    () => db.from('v_journal_list').select('*, lines:journal_lines(*, vehicle:vehicles(plate_number))', { count: 'exact' }),
    lq, r => ({ ...rowToJournalEntry(r), postedBy: r.posted_by_name ?? '' }),
    { defaultSort: { column: 'date', ascending: false }, tieBreaker: 'entry_number', signal: s }),
  { search: '' }, onProgress, signal, WITH_LINES_PAGE);

