// Server-side lists: paging, sorting, filtering, search and counting happen in Postgres
// (PostgREST range/order/filters, count: 'exact'). Used by DataTable's `server` mode and by
// exports, which fetch the full filtered result page by page (never more than PAGE_MAX rows
// per request).
import { ServiceError, toServiceError } from '../services/core';

export const PAGE_MAX = 1000;

export interface ListSort { column: string; ascending: boolean }
export interface ListQuery { offset: number; limit: number; search: string; sort?: ListSort }
export interface ListPage<T> { rows: T[]; total: number }
export type ListFetcher<T> = (q: ListQuery, signal?: AbortSignal) => Promise<ListPage<T>>;

/** A server-backed data source for DataTable. `key` identifies the filters (incl. office); `tags` the tables read. */
export interface ServerSource<T> {
  key: string;
  tags: string[];
  fetch: ListFetcher<T>;
  /** Default order when the user has not clicked a column. */
  defaultSort?: ListSort;
}

/** Words of a search box, lower-cased, without characters that have a meaning in PostgREST filters. */
export function searchTerms(search: string): string[] {
  return search.toLowerCase().replace(/[%_,()*\\:"']/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
}

// Minimal shape of a PostgREST filter builder (avoids coupling to supabase-js generics).
export interface FilterBuilder {
  ilike(column: string, pattern: string): FilterBuilder;
  order(column: string, opts: { ascending: boolean; nullsFirst?: boolean }): FilterBuilder;
  range(from: number, to: number): FilterBuilder;
  abortSignal?(signal: AbortSignal): FilterBuilder;
  then: PromiseLike<{ data: unknown[] | null; error: any; count: number | null }>['then'];
}

/**
 * Run one page of a list query. `build()` must return `from(view).select(cols, { count: 'exact' })`
 * with the page's filters applied. Every search word must appear in `searchColumn`
 * (a lower-cased text column of the list view). `tieBreaker` keeps the order stable across pages.
 */
export async function runPage<R, T>(
  build: () => FilterBuilder,
  q: ListQuery,
  map: (row: R) => T,
  opts: { searchColumn?: string; defaultSort: ListSort; tieBreaker?: string; signal?: AbortSignal },
): Promise<ListPage<T>> {
  if (q.limit < 1 || q.limit > PAGE_MAX) throw new ServiceError(`Page size must be between 1 and ${PAGE_MAX}.`);
  let b = build();
  if (opts.searchColumn) for (const w of searchTerms(q.search)) b = b.ilike(opts.searchColumn, `%${w}%`);
  const sort = q.sort ?? opts.defaultSort;
  b = b.order(sort.column, { ascending: sort.ascending, nullsFirst: false });
  if (opts.tieBreaker && opts.tieBreaker !== sort.column) b = b.order(opts.tieBreaker, { ascending: sort.ascending });
  b = b.range(q.offset, q.offset + q.limit - 1);
  if (opts.signal && b.abortSignal) b = b.abortSignal(opts.signal);
  const { data, error, count } = await b;
  if (error) throw toServiceError(error);
  return { rows: ((data ?? []) as R[]).map(map), total: count ?? 0 };
}

export interface FetchAllProgress { loaded: number; total: number }

/**
 * Every row of a list (all pages), for exports. Reports progress after each page and stops when
 * the signal is aborted (throws an AbortError).
 */
export async function fetchAllPages<T>(fetch: ListFetcher<T>, base: Omit<ListQuery, 'offset' | 'limit'>,
  onProgress?: (p: FetchAllProgress) => void, signal?: AbortSignal, pageSize = PAGE_MAX): Promise<T[]> {
  const out: T[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += pageSize) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const page = await fetch({ ...base, offset, limit: pageSize }, signal);
    total = page.total;
    out.push(...page.rows);
    onProgress?.({ loaded: out.length, total });
    if (page.rows.length < pageSize) break;
  }
  return out;
}
