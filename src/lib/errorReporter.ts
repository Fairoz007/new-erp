// Sends browser crashes to public.client_errors (readable by Super Admins only; see
// docs/OPERATIONS.md). Best effort: never throws, never retries, at most 10 reports per page load,
// the same message at most once a minute. Only the message, stack, page name and browser are sent:
// no form contents, no URL query strings.
import { supabase, isSupabaseConfigured } from './supabase';

const APP_VERSION = (import.meta as any).env?.VITE_APP_VERSION ?? 'dev';
let page = '';
let sent = 0;
const recent = new Map<string, number>();

export const setErrorPage = (p: string) => { page = p; };

export type ErrorKind = 'error' | 'unhandledrejection' | 'boundary' | 'request';

export function reportError(err: unknown, kind: ErrorKind = 'error', context: Record<string, unknown> = {}): void {
  try {
    if (!isSupabaseConfigured || sent >= 10) return;
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const message = (e.message || 'Unknown error').slice(0, 2000);
    if (/ResizeObserver loop|Export cancelled|AbortError/i.test(message) || e.name === 'AbortError') return;
    const key = `${kind}|${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 60_000) return;
    recent.set(key, now);
    sent++;
    void (supabase as any).auth.getSession().then(({ data }: any) => {
      if (!data?.session) return;                       // only signed-in users can report
      return (supabase as any).from('client_errors').insert({
        kind, page: page.slice(0, 200) || null, message,
        stack: (e.stack ?? '').slice(0, 8000) || null,
        user_agent: navigator.userAgent.slice(0, 400),
        app_version: String(APP_VERSION).slice(0, 64),
        context,
      });
    }).catch(() => undefined);
  } catch { /* reporting must never break the app */ }
}

let installed = false;
export function installErrorReporter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', ev => reportError(ev.error ?? ev.message, 'error', { source: ev.filename?.split('?')[0], line: ev.lineno }));
  window.addEventListener('unhandledrejection', ev => reportError(ev.reason, 'unhandledrejection'));
}
