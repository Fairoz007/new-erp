// Server-side figures for the dashboards, the finance overview and the layout badges: count-only
// queries, a few-row lookups and P&L trends from ledger_movements(). Nothing here loads a whole
// table. Cached through lib/queryCache and invalidated by table name like queries.ts.
import { supabase, toServiceError, num } from './core';
import { rowToJournalEntry, movementsFromRows, profitLossFrom, type MovementRow, type AnyAccount } from './accounting';
import { rowToNotification } from './system';
import { invoiceFromListRow } from './queries';
import { useQuery } from '../lib/queryCache';
import { runPage, type ServerSource } from '../lib/serverList';
import { todayYmd } from '../utils/date';
import type { FinanceInvoice } from './finance';
import type { JournalEntry } from '../types/finance';
import type { NotificationItem } from '../types/system';

type Row = Record<string, any>;
const db = supabase as any;
const officeArg = (companyId?: string | null) => (companyId && companyId !== 'all' ? companyId : null);

/** Number of rows a filtered query matches, without fetching any (count: 'exact', head: true). */
async function headCount(build: () => any): Promise<number> {
  const { count, error } = await build();
  if (error) throw toServiceError(error);
  return count ?? 0;
}
function useCount(key: string, tags: string[], build: () => any, enabled = true) {
  return useQuery<number>(`count:${key}`, tags, () => headCount(build), { enabled });
}

// ---------------------------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------------------------
/** Unread alerts of the signed-in user (header bell and sidebar). */
export function useUnreadNotificationCount(enabled = true) {
  return useQuery<number>('rpc:unread_notification_count', ['notifications', 'notification_reads'], async () => {
    const { data, error } = await db.rpc('unread_notification_count');
    if (error) throw toServiceError(error);
    return num(data);
  }, { enabled });
}

/** Invoices shown as "Overdue" (same rule as effectivePaymentStatus / invoice_status_at), every office the user can see. */
export function useOverdueInvoiceCount(enabled = true) {
  const today = todayYmd();
  return useCount(`overdue-invoices:${today}`, ['invoices', 'payments'], () =>
    db.from('invoices').select('id', { count: 'exact', head: true })
      .eq('approval_status', 'Approved').eq('is_credit_note', false)
      .not('payment_status', 'in', '(Paid,Cancelled)')
      .gt('outstanding_amount', 0.0005).lt('due_date', today), enabled);
}

/** Expenses waiting for approval in these offices. */
export function usePendingExpenseCount(companyIds: string[]) {
  const ids = [...companyIds].sort();
  return useCount(`pending-expenses:${ids.join(',')}`, ['expenses'], () =>
    db.from('expenses').select('id', { count: 'exact', head: true }).in('company_id', ids).eq('status', 'Pending Approval'), ids.length > 0);
}

/** Journal entries of one office (or all the user can see), optionally of one status. */
export function useJournalCount(companyId: string | null | undefined, status?: string, enabled = true) {
  const office = officeArg(companyId);
  return useCount(`journals:${office ?? 'all'}:${status ?? ''}`, ['journal_entries'], () => {
    let b = db.from('journal_entries').select('id', { count: 'exact', head: true });
    if (office) b = b.eq('company_id', office);
    if (status) b = b.eq('status', status);
    return b;
  }, enabled);
}

// ---------------------------------------------------------------------------------------------
// Few-row lookups
// ---------------------------------------------------------------------------------------------
const INVOICE_TAGS = ['invoices', 'invoice_lines', 'payments', 'companies', 'suppliers', 'customers', 'vehicles'];

/** See dashboard_open_invoices() for the modes. companyIds undefined = every office the user can see. */
export function useDashboardOpenInvoices(mode: 'overdue_receivables' | 'outstanding', companyIds: string[] | undefined, limit: number, opts: { enabled?: boolean } = {}) {
  const today = todayYmd();
  const ids = companyIds ? [...companyIds].sort() : null;
  const enabled = (opts.enabled ?? true) && (ids === null || ids.length > 0);
  const q = useQuery<FinanceInvoice[]>(`rpc:dashboard_open_invoices:${mode}:${ids?.join(',') ?? 'all'}:${today}:${limit}`, INVOICE_TAGS, async () => {
    const { data, error } = await db.rpc('dashboard_open_invoices', { p_mode: mode, p_companies: ids, p_today: today, p_limit: limit });
    if (error) throw toServiceError(error);
    return ((data ?? []) as Row[]).map(invoiceFromListRow);
  }, { enabled });
  return { ...q, data: enabled ? q.data : [] };
}

/** The latest journal entries (by creation time) with their debit total and poster. */
export function useRecentJournals(companyId: string | null | undefined, limit: number) {
  const office = officeArg(companyId);
  return useQuery<JournalEntry[]>(`recent-journals:${office ?? 'all'}:${limit}`, ['journal_entries', 'journal_lines'], async () => {
    let b = db.from('v_journal_list').select('*');
    if (office) b = b.eq('company_id', office);
    const { data, error } = await b.order('created_at', { ascending: false }).order('entry_number', { ascending: false }).limit(limit);
    if (error) throw toServiceError(error);
    return ((data ?? []) as Row[]).map(r => ({ ...rowToJournalEntry(r), postedBy: r.posted_by_name ?? '', totalDebit: num(r.total_debit), totalCredit: num(r.total_credit) }));
  });
}

/** The newest budget alerts the user can see (one office, or all). */
export function useBudgetAlerts(companyId: string | null | undefined, limit: number) {
  const office = officeArg(companyId);
  return useQuery<NotificationItem[]>(`budget-alerts:${office ?? 'all'}:${limit}`, ['notifications', 'notification_reads'], async () => {
    let b = db.from('notifications').select('*, notification_reads(read_at)').eq('type', 'budget_threshold');
    if (office) b = b.eq('company_id', office);
    const { data, error } = await b.order('created_at', { ascending: false }).limit(limit);
    if (error) throw toServiceError(error);
    return ((data ?? []) as Row[]).map(rowToNotification);
  });
}

// ---------------------------------------------------------------------------------------------
// Journal register (Accounting page): paged in the database, with "reversed" per row
// ---------------------------------------------------------------------------------------------
export type JournalListRow = JournalEntry & { reversed: boolean };
const JOURNAL_SORT_DEFAULT = { column: 'date', ascending: false };
export const journalRegisterSource = (companyId: string | null | undefined): ServerSource<JournalListRow> => {
  const office = officeArg(companyId);
  return {
    key: `journal-register:${office ?? 'all'}`,
    tags: ['journal_entries', 'journal_lines', 'profiles'],
    defaultSort: JOURNAL_SORT_DEFAULT,
    fetch: async (q, signal) => {
      const page = await runPage<Row, JournalListRow>(() => {
        let b: any = db.from('v_journal_list').select('*', { count: 'exact' });
        if (office) b = b.eq('company_id', office);
        return b;
      }, q, r => ({ ...rowToJournalEntry(r), postedBy: r.posted_by_name ?? '', totalDebit: num(r.total_debit), totalCredit: num(r.total_credit), reversed: false }),
      { searchColumn: 'search_text', defaultSort: JOURNAL_SORT_DEFAULT, tieBreaker: 'entry_number', signal });
      if (!page.rows.length) return page;
      // entries on this page that another entry reverses (any status, as before)
      let rb: any = db.from('journal_entries').select('reverses_entry_id').in('reverses_entry_id', page.rows.map(r => r.id));
      if (signal) rb = rb.abortSignal(signal);
      const { data, error } = await rb;
      if (error) throw toServiceError(error);
      const reversed = new Set(((data ?? []) as Row[]).map(r => r.reverses_entry_id as string));
      return { ...page, rows: page.rows.map(r => ({ ...r, reversed: reversed.has(r.id) })) };
    },
  };
};

// ---------------------------------------------------------------------------------------------
// P&L per office for several date ranges (owner dashboard trend)
// ---------------------------------------------------------------------------------------------
export interface RangePnl { revenue: number; net: number }
/** Σ over `companyIds` of revenue and net profit, one entry per range (one ledger_movements call each). */
export function useProfitLossTrend(accounts: AnyAccount[], companyIds: string[], ranges: { startDate: string; endDate: string }[]) {
  const key = `pnl-trend:${ranges.map(r => `${r.startDate}..${r.endDate}`).join(',')}`;
  const q = useQuery<MovementRow[][]>(key, ['journal_entries', 'journal_lines', 'accounts'], () =>
    Promise.all(ranges.map(async r => {
      const { data, error } = await db.rpc('ledger_movements', { p_company: null, p_from: r.startDate, p_to: r.endDate });
      if (error) throw toServiceError(error);
      return (data ?? []) as MovementRow[];
    })));
  const data: RangePnl[] | undefined = q.data?.map((rows, i) => companyIds.reduce((s, id) => {
    const p = profitLossFrom(accounts, movementsFromRows(rows, id), id, ranges[i]);
    return { revenue: s.revenue + p.totalRevenue, net: s.net + p.netProfit };
  }, { revenue: 0, net: 0 }));
  return { ...q, data };
}
