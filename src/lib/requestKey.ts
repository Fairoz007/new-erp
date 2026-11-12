// Idempotent saves. A form keeps one request key for every attempt to save the same document and
// renews it after a success. While a save runs, every write request carries the key in the
// `x-request-key` header; the database refuses a second payment, journal, invoice or expense with
// a key it has already seen (20261113001000_concurrency.sql), so a double click or a retry after a
// timeout never creates two documents.
import { useCallback, useRef } from 'react';

let current: string | null = null;

const uuid = (): string => (globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

/** The key of the save in progress, if any (read by the Supabase client's fetch). */
export const currentRequestKey = () => current;

/** Run a save with a request key. Saves do not overlap in one tab (buttons are disabled while busy). */
export async function withRequestKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = current;
  current = key;
  try { return await fn(); } finally { current = prev; }
}

/** One key per form; `renew()` after a successful save (the next save is a new document). */
export function useRequestKey(): { key: () => string; renew: () => void; run: <T>(fn: () => Promise<T>) => Promise<T> } {
  const ref = useRef<string>(uuid());
  const key = useCallback(() => ref.current, []);
  const renew = useCallback(() => { ref.current = uuid(); }, []);
  const run = useCallback(<T,>(fn: () => Promise<T>) => withRequestKey(ref.current, fn), []);
  return { key, renew, run };
}

/** fetch wrapper for the Supabase client: adds the header to write requests during a keyed save. */
export function keyedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const k = current;
  const method = (init.method ?? 'GET').toUpperCase();
  // Writes are blocked while the browser is offline (the banner says so); reads fail on their own.
  const url = String(input instanceof Request ? input.url : input);
  if (method !== 'GET' && method !== 'HEAD' && !/\/auth\/v1\//.test(url)
      && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new TypeError('Failed to fetch: you are offline, so nothing was saved.'));
  }
  if (k && method !== 'GET' && method !== 'HEAD') {
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-request-key', k);
    init = { ...init, headers };
  }
  return fetch(input, init);
}
