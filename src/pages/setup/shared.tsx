// Shared building blocks for the Setup Wizard steps. The same step components are reused in
// Settings, so they must not depend on UIContext (not mounted while the wizard runs).
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import * as org from '../../services/org';
import type { MasterName } from '../../services/org';
import { listCompanies } from '../../services/fleet';
import type { Company } from '../../types/system';

export type Notice = { tone: 'error' | 'success' | 'info'; text: string } | null;

export const NoticeBar: React.FC<{ notice: Notice; onClose?: () => void }> = ({ notice, onClose }) => {
  if (!notice) return null;
  const styles = {
    error: 'bg-rose-50 border-rose-200 text-rose-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    info: 'bg-sky-50 border-sky-200 text-sky-700',
  }[notice.tone];
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${styles}`}>
      {notice.tone === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
      <span className="flex-1 break-words">{notice.text}</span>
      {onClose && <button type="button" className="font-bold opacity-60 hover:opacity-100" onClick={onClose} aria-label="Dismiss">×</button>}
    </div>
  );
};

// Notice that clears itself a few seconds after a success
export function useNotice(): [Notice, (n: Notice) => void] {
  const [notice, setNotice] = useState<Notice>(null);
  const timer = useRef<number>();
  const set = useCallback((n: Notice) => {
    window.clearTimeout(timer.current);
    setNotice(n);
    if (n && n.tone === 'success') timer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [notice, set];
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Generic list loader for a master table with loading / error / reload
export function useMaster<K extends MasterName>(name: K) {
  type T = Awaited<ReturnType<typeof org.listMaster<K>>>[number];
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setRows(await org.listMaster(name)); }
    catch (e) { setError(errText(e)); }
    finally { setLoading(false); }
  }, [name]);
  useEffect(() => { void reload(); }, [reload]);
  return { rows, setRows, loading, error, reload };
}

export function useOffices() {
  const [offices, setOffices] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setOffices(await listCompanies()); }
    catch (e) { setError(errText(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { offices, loading, error, reload };
}

export const LoadState: React.FC<{ loading: boolean; error: string | null; onRetry: () => void; empty?: boolean; emptyText?: string; children?: ReactNode }> = ({
  loading, error, onRetry, empty, emptyText, children,
}) => {
  if (error) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
        <span className="flex-1">Could not load: {error}</span>
        <Button size="xs" variant="outline" onClick={onRetry} leftIcon={<RefreshCw className="w-3 h-3" />}>Try again</Button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-4" role="status">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (empty) return <p className="text-xs text-slate-400 py-3">{emptyText ?? 'Nothing here yet.'}</p>;
  return <>{children}</>;
};

export const Section: React.FC<{ title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }> = ({ title, description, action, children }) => (
  <section className="bg-white border border-slate-700 rounded-2xl shadow-card p-4 sm:p-5 space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <label className={`inline-flex items-center gap-2 text-xs text-slate-200 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <input type="checkbox" className="w-4 h-4 accent-[#086343]" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    {label}
  </label>
);

export const tableCls = 'w-full text-left text-xs text-slate-300';
export const thCls = 'px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-700';
export const tdCls = 'px-3 py-2 border-b border-slate-700/60 align-middle';

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). Returns header-keyed rows.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) out.push(row);
  if (out.length === 0) return { headers: [], rows: [] };
  const headers = out[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return {
    headers,
    rows: out.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CURRENCIES = ['OMR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'USD', 'EUR', 'GBP', 'INR'];
export const TIMEZONES = ['Asia/Muscat', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Kolkata', 'Europe/London', 'UTC'];
