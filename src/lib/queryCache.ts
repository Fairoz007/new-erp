// Small query cache for server-side lists and aggregates.
//
// * Each query has a key (what to fetch: page, filters, office) and tags (which tables it reads).
// * Results are cached per signed-in user; a component mounting with a cached key shows the cached
//   result at once and refetches in the background when it is older than STALE_MS.
// * invalidate(tags) marks every cached query that reads one of those tables as stale and refetches
//   the ones that are on screen. Writes (FleetContext mutations) and realtime events call it, so
//   only what changed is reloaded.
// * Identical concurrent requests are shared; a request whose key is no longer wanted is ignored.
// Business data stays in memory only (never localStorage / IndexedDB) and is dropped on sign-out.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export const STALE_MS = 30_000;
const MAX_ENTRIES = 200;

interface Entry {
  data?: unknown;
  error?: Error;
  at: number;              // when data arrived (0 = never)
  stale: boolean;
  tags: string[];
  promise?: Promise<unknown>;
  listeners: Set<() => void>;
  lastUsed: number;
}

const cache = new Map<string, Entry>();
let scope = '';             // user id: a different user never sees another user's cached rows

export function setCacheScope(userId: string): void {
  if (userId !== scope) { cache.clear(); scope = userId; }
}
export function clearQueryCache(): void { cache.clear(); }

function entry(key: string, tags: string[]): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { at: 0, stale: true, tags, listeners: new Set(), lastUsed: Date.now() };
    cache.set(key, e);
    if (cache.size > MAX_ENTRIES) evict();
  }
  e.lastUsed = Date.now();
  return e;
}

function evict() {
  const idle = [...cache.entries()].filter(([, e]) => e.listeners.size === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [k] of idle.slice(0, cache.size - MAX_ENTRIES)) cache.delete(k);
}

const notify = (e: Entry) => e.listeners.forEach(l => l());

/** Fetch (or join an in-flight fetch of) a key. Errors are kept on the entry and rethrown. */
export function fetchQuery<T>(key: string, tags: string[], fn: () => Promise<T>, force = false): Promise<T> {
  const e = entry(key, tags);
  if (e.promise) return e.promise as Promise<T>;
  if (!force && e.at && !e.stale && Date.now() - e.at < STALE_MS) return Promise.resolve(e.data as T);
  const p = fn().then(
    data => { if (cache.get(key) === e) { e.data = data; e.error = undefined; e.at = Date.now(); e.stale = false; } return data; },
    err => { if (cache.get(key) === e) { e.error = err instanceof Error ? err : new Error(String(err)); e.stale = false; } throw err; },
  ).finally(() => { if (e.promise === p) e.promise = undefined; notify(e); });
  e.promise = p;
  notify(e);
  return p;
}

/** Mark queries reading any of these tables stale; queries on screen refetch. */
export function invalidate(tags: string[]): void {
  if (!tags.length) return;
  const set = new Set(tags);
  for (const e of cache.values()) {
    if (e.tags.some(t => set.has(t))) { e.stale = true; notify(e); }
  }
}

/** Mark every cached query stale (tab visible again after a while); queries on screen refetch. */
export function markAllStale(olderThanMs = STALE_MS): void {
  const now = Date.now();
  for (const e of cache.values()) if (e.at && now - e.at > olderThanMs) { e.stale = true; notify(e); }
}

/** Test helper: the number of cached keys. */
export const cacheSize = () => cache.size;

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True while there is no data for the current key yet. */
  loading: boolean;
  /** True while any request for the current key is running (including background refreshes). */
  fetching: boolean;
  refetch: () => Promise<void>;
}

/**
 * Subscribe to a cached query. `key` must change whenever the request changes (filters, page,
 * office). `enabled: false` skips fetching (e.g. until a required filter is chosen).
 * While a new key loads, the previous key's data is kept on screen (no flash to empty).
 */
export function useQuery<T>(key: string, tags: string[], fn: () => Promise<T>, opts: { enabled?: boolean } = {}): QueryState<T> {
  const enabled = opts.enabled ?? true;
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const tagsKey = tags.join('|');

  const subscribe = useCallback((cb: () => void) => {
    const e = entry(key, tagsKey ? tagsKey.split('|') : []);
    e.listeners.add(cb);
    return () => { e.listeners.delete(cb); };
  }, [key, tagsKey]);
  const snapshot = useCallback(() => {
    const e = cache.get(key);
    return e ? `${e.at}|${e.stale}|${!!e.promise}|${e.error?.message ?? ''}` : '';
  }, [key]);
  useSyncExternalStore(subscribe, snapshot, snapshot);

  const e = cache.get(key);
  // an error is shown until the user retries or the data is invalidated (no retry loop)
  const needs = enabled && (!e || (!e.promise && (e.stale || (e.at > 0 && Date.now() - e.at >= STALE_MS))));
  useEffect(() => {
    if (!needs) return;
    fetchQuery(key, tagsKey ? tagsKey.split('|') : [], () => fnRef.current(), true).catch(() => undefined);
  }, [needs, key, tagsKey]);

  // keep the last data shown while the next key loads
  const last = useRef<T | undefined>(undefined);
  if (e?.at) last.current = e.data as T;

  const refetch = useCallback(async () => {
    await fetchQuery(key, tagsKey ? tagsKey.split('|') : [], () => fnRef.current(), true).catch(() => undefined);
  }, [key, tagsKey]);

  return {
    data: e?.at ? (e.data as T) : last.current,
    error: e?.error,
    loading: enabled && !e?.at && !e?.error,
    fetching: !!e?.promise,
    refetch,
  };
}

/** Same as useState, but resets to `initial` whenever `resetKey` changes (e.g. page back to 1). */
export function useResettableState<T>(initial: T, resetKey: string): [T, (v: T) => void] {
  const [state, setState] = useState<{ key: string; value: T }>({ key: resetKey, value: initial });
  const value = state.key === resetKey ? state.value : initial;
  const set = useCallback((v: T) => setState({ key: resetKey, value: v }), [resetKey]);
  return [value, set];
}
