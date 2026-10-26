// Shared helpers for the Supabase service layer (src/services/*).
// Conventions (see docs/audit/CONTRACTS.md):
//   * Every service function is async and THROWS a ServiceError on failure.
//     Never swallow an error into [] / null / a fake success value.
//   * Rows are mapped to the existing app types in src/types/* so pages keep working.
//   * Amounts come back from PostgREST as strings for numeric columns: always use num().
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export { supabase };

export class ServiceError extends Error {
  code?: string;
  details?: string;
  hint?: string;

  constructor(message: string, opts: { code?: string; details?: string; hint?: string } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = opts.code;
    this.details = opts.details;
    this.hint = opts.hint;
  }
}

// Turn Postgres/PostgREST errors into messages a user can act on.
export const toServiceError = (err: PostgrestError | Error | { message: string; code?: string }): ServiceError => {
  if (err instanceof ServiceError) return err;
  const code = (err as PostgrestError).code;
  let message = err.message || 'Unexpected error';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    message = message.includes('Permission denied') ? message : 'Permission denied for this action.';
  } else if (code === '23505') {
    message = 'A record with the same unique value already exists.';
  } else if (code === '23503') {
    message = 'This record is linked to other records and cannot be changed or removed.';
  } else if (code === '23514') {
    message = `Validation failed: ${message}`;
  }
  return new ServiceError(message, {
    code,
    details: (err as PostgrestError).details,
    hint: (err as PostgrestError).hint,
  });
};

// Await a PostgREST builder and return its data, throwing on error.
export async function unwrap<T>(query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw toServiceError(error);
  return data as T;
}

// Same as unwrap but also fails when no row came back (e.g. .single() after insert hidden by RLS).
export async function unwrapOne<T>(query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const data = await unwrap(query);
  if (data == null) throw new ServiceError('Record not found or not accessible.');
  return data;
}

// Call an RPC. Typed overload for functions present in src/types/database.ts;
// new RPCs that are not yet in the generated types can be called through rpcAny.
export async function rpcAny<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw toServiceError(error);
  return data as T;
}

// numeric columns arrive as strings; null/undefined -> 0
export const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
export const numOrUndef = (v: unknown): number | undefined => (v == null || v === '' ? undefined : Number(v));
// '' / undefined -> null for optional DB columns
export const nul = <T>(v: T | '' | undefined | null): T | null => (v === '' || v === undefined ? null : v);
// timestamptz/date -> 'YYYY-MM-DD'
export const ymd = (v: string | null | undefined): string => (v ? v.slice(0, 10) : '');

export const currentUserId = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
};

/**
 * Load every row of a large ordered query. Pages are modest (a big page can exceed the database
 * statement timeout) and fetched a few at a time in parallel instead of strictly one after another.
 * `page(from, to)` must return the rows for that inclusive range.
 */
export async function fetchPaged<R>(page: (from: number, to: number) => Promise<R[] | null>, size = 400, parallel = 3): Promise<R[]> {
  const out: R[] = [];
  for (let start = 0; ; start += size * parallel) {
    const batch = await Promise.all(
      Array.from({ length: parallel }, (_, i) => page(start + i * size, start + (i + 1) * size - 1)),
    );
    let done = false;
    for (const rows of batch) {
      out.push(...(rows ?? []));
      if (!rows || rows.length < size) done = true;
    }
    if (done) return out;
  }
}

// Collection names held in FleetContext; services declare which ones a mutation changes.
export type CollectionKey =
  | 'companies' | 'vehicles' | 'tyres' | 'tyreEvents' | 'oilChanges' | 'maintenanceRecords' | 'workOrders'
  | 'accidents' | 'expenses' | 'suppliers' | 'customers' | 'invoices' | 'reconciliations' | 'payments'
  | 'bankAccounts' | 'chartOfAccounts' | 'journalEntries' | 'fixedAssets' | 'depreciationRuns' | 'employees'
  | 'payrollRuns' | 'documents' | 'timeline' | 'notifications' | 'approvalRules' | 'approvalRequests' | 'auditLogs';

export type Fetchers = Partial<Record<CollectionKey, () => Promise<any[]>>>;
