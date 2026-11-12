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

/** A save was refused because someone else changed the record first (optimistic locking). */
export const CONFLICT = 'CONFLICT';

/**
 * Message a user can act on for a Postgres / PostgREST / network error. Messages raised on purpose
 * by our own functions (P0001, e.g. "Permission denied: …", "above your approval limit") are kept.
 */
export function friendlyMessage(code: string | undefined, message: string, details?: string): string {
  const m = message || 'Unexpected error';
  if (code === CONFLICT) return m;
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(m))
    return 'Could not reach the server. Check your connection and try again.';
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt expired|invalid jwt|refresh token/i.test(m))
    return 'Your session has expired. Please sign in again.';
  if (code === '42501' || /row-level security|permission denied/i.test(m))
    return m.includes('Permission denied') ? m : 'Permission denied for this action.';
  if (code === '23505') {
    const what = /Key \(([^)]+)\)/.exec(details ?? '')?.[1]?.replace(/_/g, ' ');
    return what ? `A record with the same ${what} already exists.` : 'A record with the same unique value already exists.';
  }
  if (code === '23503') return 'This record is linked to other records and cannot be changed or removed.';
  if (code === '23514') return `Validation failed: ${m}`;
  if (code === '23502') return 'A required field is missing.';
  if (code === '22P02' || code === '22007' || code === '22008') return 'A value has the wrong format (check numbers and dates).';
  if (code === '22003') return 'A number is too large.';
  if (code === '40001' || code === '40P01') return 'The database was busy with a conflicting change. Please try again.';
  if (code === '57014') return 'The request took too long. Narrow the filters (office, dates) and try again.';
  if (code === 'PGRST116') return 'Record not found or not accessible.';
  if (code === '54000' || /too many|limit exceeded/i.test(m)) return m;
  return m;
}

/** True for errors worth retrying automatically (network, busy database). */
export const isTransient = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string };
  return e?.code === '40001' || e?.code === '40P01' || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(e?.message ?? '');
};

// Turn Postgres/PostgREST errors into messages a user can act on.
export const toServiceError = (err: PostgrestError | Error | { message: string; code?: string }): ServiceError => {
  if (err instanceof ServiceError) return err;
  const code = (err as PostgrestError).code;
  return new ServiceError(friendlyMessage(code, err.message, (err as PostgrestError).details), {
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

/** In-flight request deduplication: coalesce simultaneous identical queries */
const inFlightRequests = new Map<string, Promise<any>>();

export function dedupFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

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
