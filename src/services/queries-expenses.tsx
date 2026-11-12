// Server-side queries for the expenses & payments group (Expenses, Monthly expenses, expense
// approvals, Payments, Reconciliation, invoice print view, global search and the quick-action
// pickers). Built on the shared sources in ./queries; every request is ≤ 1000 rows, filtered in
// the database and cached through lib/queryCache (invalidated by table name after writes).
import React, { useEffect, useState } from 'react';
import { supabase, toServiceError, num } from './core';
import { fetchInvoice, type FinanceInvoice } from './finance';
import type { FieldDefinition } from './org';
import {
  expenseFromListRow, expenseSource, fetchAllOf, fetchInvoicePage, invoiceFromListRow, paymentFromListRow, rpcPage, useRpc,
  type ExpenseFilter,
} from './queries';
import { useQuery } from '../lib/queryCache';
import { runPage, type ListPage, type ServerSource } from '../lib/serverList';
import type { Payment } from '../types/finance';
import type { VehicleExpense } from '../types/operations';
import { FilterInput, FilterSelect } from '../components/ui/FilterControls';

type Row = Record<string, any>;
const db = supabase as any;
const officeArg = (companyId?: string | null) => (companyId && companyId !== 'all' ? companyId : null);

// Same tags as the sources in ./queries (tables each query reads)
const EXPENSE_TAGS = ['expenses', 'vehicles', 'suppliers', 'employees'];
const PAYMENT_TAGS = ['payments', 'invoices', 'bank_accounts', 'companies'];
const INVOICE_TAGS = ['invoices', 'invoice_lines', 'payments', 'companies', 'suppliers', 'customers', 'vehicles'];

/** A value that settles `ms` after the last change (search boxes: one request per pause). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------------------------
const cleanFilter = (f: ExpenseFilter) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '' && v !== 'all') out[k] = v;
  if (out.company && !officeArg(out.company as string)) delete out.company;
  return out;
};

/** One expense by id (detail modal), refreshed whenever expenses change. */
export function useExpenseById(id: string | null | undefined) {
  return useQuery<VehicleExpense | null>(`expense:${id ?? ''}`, EXPENSE_TAGS, async () => {
    const { data, error } = await db.from('v_expense_list').select('*').eq('id', id).maybeSingle();
    if (error) throw toServiceError(error);
    return data ? expenseFromListRow(data) : null;
  }, { enabled: !!id });
}

/**
 * The latest copy of an expense opened from a list (detail modals): the row itself until the
 * fresh copy arrives, then that copy after every change; null once it is deleted or not visible.
 */
export function useOpenExpense(row: VehicleExpense | null): VehicleExpense | null {
  const q = useExpenseById(row?.id);
  if (!row) return null;
  if (q.data && q.data.id === row.id) return q.data;
  if (q.data === null && !q.loading && !q.fetching) return null;
  return row;
}

/** Every expense matching a filter (all pages of ≤ 1000), for short work lists such as approvals. */
export function useExpenseList(f: ExpenseFilter, opts: { enabled?: boolean } = {}) {
  const src = expenseSource(f);
  return useQuery<VehicleExpense[]>(`${src.key}|all`, src.tags, () => fetchAllOf(src), opts);
}

export interface ExpensePageFigures { pending_total: number; unpaid_total: number; filtered_count: number; categories: string[] }
/** Expenses page figures not in expense_summary (see expense_page_figures in the migration). */
export function useExpensePageFigures(f: ExpenseFilter) {
  const q = useRpc<Row>('expense_page_figures', { p_filter: cleanFilter(f) }, EXPENSE_TAGS);
  const d = q.data;
  return { ...q, data: d ? { pending_total: num(d.pending_total), unpaid_total: num(d.unpaid_total), filtered_count: num(d.filtered_count), categories: (d.categories ?? []) as string[] } as ExpensePageFigures : undefined };
}

/**
 * Custom field filter for a server-side list: the same control as useCustomFieldFilter, but it
 * returns the `cf` key of the expense filter (applied by expense_matches in the database) instead
 * of filtering rows in the browser. `cf` is undefined while no value is entered (= no filter).
 */
export function useServerCustomFieldFilter(defs: FieldDefinition[]) {
  const filterable = defs.filter(d => d.fieldType !== 'file');
  const [fieldKey, setFieldKey] = useState('');
  const [value, setValue] = useState('');
  const [to, setTo] = useState('');
  const def = filterable.find(d => d.key === fieldKey);
  // typed values (text, number, date) are sent after a short pause, choices at once
  const typed = !!def && def.fieldType !== 'dropdown' && def.fieldType !== 'boolean';
  const debValue = useDebounced(value, typed ? 300 : 0);
  const debTo = useDebounced(to, typed ? 300 : 0);
  const cf: ExpenseFilter['cf'] = def && (value !== '' || to !== '') && (debValue !== '' || debTo !== '')
    ? { key: def.key, type: def.fieldType, value: debValue, to: debTo }
    : undefined;

  const ui = filterable.length === 0 ? null : (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect aria-label="Filter by custom field" value={fieldKey} onChange={e => { setFieldKey(e.target.value); setValue(''); setTo(''); }}>
        <option value="">Filter by field…</option>
        {filterable.map(d => <option key={d.id} value={d.key}>{d.label}</option>)}
      </FilterSelect>
      {def && (def.fieldType === 'dropdown' || def.fieldType === 'boolean') && (
        <FilterSelect aria-label={def.label} value={value} onChange={e => setValue(e.target.value)}>
          <option value="">Any</option>
          {(def.fieldType === 'boolean' ? ['yes', 'no'] : def.options).map(o => <option key={o} value={o}>{def.fieldType === 'boolean' ? (o === 'yes' ? 'Yes' : 'No') : o}</option>)}
        </FilterSelect>
      )}
      {def && (def.fieldType === 'number' || def.fieldType === 'date') && (
        <>
          <FilterInput aria-label={`${def.label} from`} type={def.fieldType} value={value} onChange={e => setValue(e.target.value)} placeholder="From" />
          <FilterInput aria-label={`${def.label} to`} type={def.fieldType} value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
        </>
      )}
      {def && def.fieldType === 'text' && (
        <FilterInput aria-label={def.label} value={value} onChange={e => setValue(e.target.value)} placeholder="Contains…" />
      )}
      {def && (value !== '' || to !== '') && (
        <button type="button" className="text-xs text-slate-400 hover:underline" onClick={() => { setValue(''); setTo(''); }}>Clear</button>
      )}
    </div>
  );
  return { cf, ui };
}

// ---------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------
export interface PaymentListFilter {
  companyId?: string | null; method?: string; bankAccountId?: string; partyType?: 'Supplier' | 'Customer'; from?: string; to?: string;
}

/** Payments register (v_payment_list), with the Payments page filters. */
export const paymentListSource = (f: PaymentListFilter): ServerSource<Payment> => ({
  key: `payments-register:${JSON.stringify(f)}`,
  tags: PAYMENT_TAGS,
  defaultSort: { column: 'payment_date', ascending: false },
  fetch: (q, signal) => runPage<Row, Payment>(() => {
    let b: any = db.from('v_payment_list').select('*', { count: 'exact' });
    if (officeArg(f.companyId)) b = b.eq('company_id', f.companyId);
    if (f.method) b = b.eq('payment_method', f.method);
    if (f.bankAccountId) b = b.eq('bank_account_id', f.bankAccountId);
    if (f.partyType) b = b.eq('party_type', f.partyType);
    if (f.from) b = b.gte('payment_date', f.from);
    if (f.to) b = b.lte('payment_date', f.to);
    return b;
  }, q, paymentFromListRow, { searchColumn: 'search_text', defaultSort: { column: 'payment_date', ascending: false }, tieBreaker: 'id', signal }),
});

export interface PaymentTotals { disbursed: { currency: string | null; total: number }[]; received: { currency: string | null; total: number }[]; methods: string[] }
export function usePaymentTotals(f: PaymentListFilter) {
  const p_filter: Record<string, string> = {};
  if (officeArg(f.companyId)) p_filter.company = f.companyId!;
  if (f.method) p_filter.method = f.method;
  if (f.bankAccountId) p_filter.bank = f.bankAccountId;
  if (f.partyType) p_filter.party_type = f.partyType;
  if (f.from) p_filter.from = f.from;
  if (f.to) p_filter.to = f.to;
  const q = useRpc<Row>('payment_totals', { p_filter }, PAYMENT_TAGS);
  const d = q.data;
  const list = (xs: Row[] | undefined) => (xs ?? []).map(x => ({ currency: x.currency ?? null, total: num(x.total) }));
  return { ...q, data: d ? { disbursed: list(d.disbursed), received: list(d.received), methods: (d.methods ?? []) as string[] } as PaymentTotals : undefined };
}

// ---------------------------------------------------------------------------------------------
// Invoices (one invoice, its credit notes, pickers, search)
// ---------------------------------------------------------------------------------------------
/** One invoice with its lines (print view, payment voucher). */
export function useInvoiceById(id: string | null | undefined) {
  return useQuery<FinanceInvoice>(`invoice:${id ?? ''}`, INVOICE_TAGS, () => fetchInvoice(id!), { enabled: !!id });
}

/** Documents raised against an invoice (credit / debit notes): parent_invoice_id = id. */
export function useChildInvoices(parentId: string | null | undefined) {
  return useQuery<FinanceInvoice[]>(`invoice-children:${parentId ?? ''}`, INVOICE_TAGS,
    async () => (await fetchInvoicePage({ parentId: parentId! }, { offset: 0, limit: 1000, search: '' })).rows, { enabled: !!parentId });
}

export const PICKER_LIMIT = 50;
/**
 * Invoices for a picker, searched in the database (at most PICKER_LIMIT rows).
 *  payable:   posted, not a credit note, not cancelled, with a balance (record_payment rule)
 *  reconcile: purchase invoices not cancelled and not yet reconciled
 */
export function useInvoiceOptions(kind: 'payable' | 'reconcile', companyId: string | null | undefined, search: string, opts: { enabled?: boolean } = {}) {
  const office = officeArg(companyId);
  return useQuery<ListPage<FinanceInvoice>>(`invoice-options:${kind}:${office ?? ''}:${search}`, [...INVOICE_TAGS, 'reconciliations'], () => kind === 'payable'
    ? fetchInvoicePage({ companyId: office, view: 'pending' }, { offset: 0, limit: PICKER_LIMIT, search, sort: { column: 'invoice_date', ascending: false } })
    : rpcPage('reconcilable_invoice_page', { p_company: office, p_search: search || null, p_limit: PICKER_LIMIT, p_offset: 0 }, invoiceFromListRow), opts);
}

/** Global search: the first `limit` invoices matching every word (v_invoice_list.search_text) and the total. */
export function useInvoiceSearch(search: string, limit = 8, opts: { enabled?: boolean } = {}) {
  return useQuery<ListPage<FinanceInvoice>>(`invoice-search:${limit}:${search}`, INVOICE_TAGS,
    () => fetchInvoicePage({}, { offset: 0, limit, search, sort: { column: 'invoice_date', ascending: false } }), opts);
}
