// Server-side figures for the reports, vehicle profitability, vehicle dossier and party pages
// (migration 20261113000200_advance_reports.sql). Every request returns at most PAGE_MAX rows;
// "all" helpers page through the result.
import { supabase, toServiceError, num, ymd } from './core';
import { rowToAuditLog } from './system';
import { useQuery } from '../lib/queryCache';
import { PAGE_MAX, type ServerSource } from '../lib/serverList';
import type { VehicleMoneyTotals } from './fleet';
import type { AuditLog } from '../types/system';

type Row = Record<string, any>;
const db = supabase as any;
const officeArg = (companyId?: string | null) => (companyId && companyId !== 'all' ? companyId : null);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw toServiceError(error);
  return data as T;
}

// ---------------------------------------------------------------------------------------------
// Party statement
// ---------------------------------------------------------------------------------------------
export interface PartyStatementLine {
  line_id: string; source_id: string; kind: 'Invoice' | 'Credit Note' | 'Debit Note' | 'Payment';
  date: string; reference: string; invoice_number: string | null; invoice_type: string | null; notes: string | null;
  line_count: number; payment_method: string | null; charge: number; credit: number; running_balance: number;
}
export interface PartyStatement {
  opening_balance: number; closing_balance: number; total_charge: number; total_credit: number; total_count: number;
  lines: PartyStatementLine[];
}
export interface PartyStatementArgs {
  partyId: string; kind: 'Supplier' | 'Customer'; companyId?: string | null; from?: string; to?: string;
  /** 'ledger' = General Ledger party tab (opening balance of the party, cancelled excluded);
   *  'statement' = Client / Supplier Statement report. */
  style: 'ledger' | 'statement';
}

const mapStatement = (d: Row): PartyStatement => ({
  opening_balance: num(d.opening_balance), closing_balance: num(d.closing_balance),
  total_charge: num(d.total_charge), total_credit: num(d.total_credit), total_count: num(d.total_count),
  lines: ((d.lines ?? []) as Row[]).map(l => ({ ...l, date: ymd(l.date), line_count: num(l.line_count), charge: num(l.charge),
    credit: num(l.credit), running_balance: num(l.running_balance) }) as PartyStatementLine),
});

export async function fetchPartyStatementPage(a: PartyStatementArgs, limit: number, offset: number): Promise<PartyStatement> {
  return mapStatement(await rpc<Row>('party_statement', {
    p_party: a.partyId, p_kind: a.kind, p_company: officeArg(a.companyId), p_from: a.from || null, p_to: a.to || null,
    p_style: a.style, p_limit: limit, p_offset: offset,
  }));
}

/** The whole statement (every line, fetched PAGE_MAX at a time). */
export async function fetchPartyStatement(a: PartyStatementArgs): Promise<PartyStatement> {
  const first = await fetchPartyStatementPage(a, PAGE_MAX, 0);
  const lines = [...first.lines];
  while (lines.length < first.total_count) {
    const next = await fetchPartyStatementPage(a, PAGE_MAX, lines.length);
    if (!next.lines.length) break;
    lines.push(...next.lines);
  }
  return { ...first, lines };
}

const STATEMENT_TAGS = ['invoices', 'invoice_lines', 'payments', 'suppliers', 'customers'];
export function usePartyStatement(a: PartyStatementArgs, opts: { enabled?: boolean } = {}) {
  return useQuery<PartyStatement>(`party_statement:${JSON.stringify({ ...a, companyId: officeArg(a.companyId) })}`, STATEMENT_TAGS,
    () => fetchPartyStatement(a), { enabled: (opts.enabled ?? true) && !!a.partyId });
}

// ---------------------------------------------------------------------------------------------
// Vehicle totals (expenses by bucket and sales revenue per vehicle)
// ---------------------------------------------------------------------------------------------
export interface VehicleTotalsRow extends VehicleMoneyTotals { vehicle_id: string; expense_total: number }

async function fetchVehicleTotals(companyId: string | null, vehicleId: string | null): Promise<Map<string, VehicleTotalsRow>> {
  const out = new Map<string, VehicleTotalsRow>();
  for (let offset = 0; ; offset += PAGE_MAX) {
    const rows = await rpc<Row[]>('vehicle_financial_totals', { p_company: companyId, p_vehicle: vehicleId, p_limit: PAGE_MAX, p_offset: offset });
    for (const r of rows ?? []) {
      out.set(r.vehicle_id, { vehicle_id: r.vehicle_id, insurance: num(r.insurance), registration: num(r.registration), other: num(r.other),
        expense_total: num(r.expense_total), revenue: num(r.revenue) });
    }
    if (!rows || rows.length < PAGE_MAX) break;
  }
  return out;
}

/** Totals per vehicle id. companyId = vehicles of that office; vehicleId = one vehicle. */
export function useVehicleTotals(companyId?: string | null, vehicleId?: string | null, opts: { enabled?: boolean } = {}) {
  const c = officeArg(companyId), v = vehicleId ?? null;
  return useQuery<Map<string, VehicleTotalsRow>>(`vehicle_totals:${c ?? 'all'}:${v ?? 'all'}`, ['expenses', 'invoices', 'vehicles'],
    () => fetchVehicleTotals(c, v), opts);
}

// ---------------------------------------------------------------------------------------------
// VAT by month
// ---------------------------------------------------------------------------------------------
export interface TaxMonth { month: string; output_tax: number; input_tax: number }
export function useTaxByMonth(companyId: string | null | undefined, from?: string, to?: string, opts: { enabled?: boolean } = {}) {
  const args = { p_company: officeArg(companyId), p_from: from || null, p_to: to || null };
  return useQuery<TaxMonth[]>(`invoice_tax_by_month:${JSON.stringify(args)}`, ['invoices'],
    async () => ((await rpc<Row[]>('invoice_tax_by_month', args)) ?? []).map(r => ({ month: r.month, output_tax: num(r.output_tax), input_tax: num(r.input_tax) })),
    opts);
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
/** Number of rows of a server source (for tab badges). */
export function useSourceCount<T>(src: ServerSource<T>, opts: { enabled?: boolean } = {}) {
  return useQuery<number>(`count:${src.key}`, src.tags, async () => (await src.fetch({ offset: 0, limit: 1, search: '' })).total, opts);
}

/** Audit history of one record (newest first, at most PAGE_MAX entries) and the total number of entries. */
export function useRecordHistory(entityId: string | undefined) {
  return useQuery<{ rows: AuditLog[]; total: number }>(`record_history:${entityId ?? ''}`, ['audit_logs'], async () => {
    const { data, error, count } = await db.from('audit_logs').select('*', { count: 'exact' })
      .eq('entity_id', entityId).order('occurred_at', { ascending: false }).limit(PAGE_MAX);
    if (error) throw toServiceError(error);
    return { rows: ((data ?? []) as Row[]).map(rowToAuditLog), total: count ?? 0 };
  }, { enabled: !!entityId });
}
