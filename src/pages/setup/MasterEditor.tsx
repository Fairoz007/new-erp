// Editable table for small master lists (tax rates, payment terms, units, vehicle types, expense
// categories, fee items). Each row saves on its own; the database validates (check constraints,
// unique names, RLS) and the message is shown inline.
import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Star } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import * as org from '../../services/org';
import type { MasterName } from '../../services/org';
import { LoadState, NoticeBar, errText, tableCls, tdCls, thCls, useMaster, useNotice } from './shared';

export interface Column<T> {
  key: keyof T & string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox';
  options?: { value: string; label: string; disabled?: boolean }[];
  required?: boolean;
  width?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
  editableOnCreateOnly?: boolean;
  nullable?: boolean;           // number: blank -> null
  validate?: (v: unknown, row: Partial<T>) => string | null;
}

interface Props<T> {
  master: MasterName;
  columns: Column<T>[];
  rowKey: (r: T) => string;
  blank: Partial<T>;
  readOnly?: boolean;
  canDelete?: (r: T) => string | null;   // reason when deletion is not allowed
  defaultFlag?: 'taxRates' | 'paymentTerms' | 'feeSchedules';
  filter?: (r: T) => boolean;
  addLabel?: string;
  emptyText?: string;
  allowAdd?: boolean;
  onChanged?: () => void;
}

export function MasterEditor<T extends Record<string, any>>({
  master, columns, rowKey, blank, readOnly, canDelete, defaultFlag, filter, addLabel = 'Add', emptyText, allowAdd = true, onChanged,
}: Props<T>) {
  const { rows, loading, error, reload } = useMaster(master) as unknown as { rows: T[]; loading: boolean; error: string | null; reload: () => Promise<void> };
  const [drafts, setDrafts] = useState<Record<string, Partial<T>>>({});
  const [adding, setAdding] = useState<Partial<T> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [notice, setNotice] = useNotice();

  useEffect(() => { setDrafts({}); }, [rows]);
  const visible = filter ? rows.filter(filter) : rows;

  const check = (row: Partial<T>, id: string): boolean => {
    const errs: Record<string, string> = {};
    for (const c of columns) {
      const v = row[c.key];
      if (c.required && (v === undefined || v === null || String(v).trim() === '')) errs[`${id}:${c.key}`] = `${c.label} is required`;
      else if (c.type === 'number' && v !== null && v !== undefined && v !== '' && (Number.isNaN(Number(v)) || (c.min !== undefined && Number(v) < c.min) || (c.max !== undefined && Number(v) > c.max))) {
        errs[`${id}:${c.key}`] = `${c.label} must be ${c.min !== undefined ? `≥ ${c.min}` : ''}${c.max !== undefined ? ` and ≤ ${c.max}` : ''}`;
      } else if (c.validate) {
        const m = c.validate(v, row);
        if (m) errs[`${id}:${c.key}`] = m;
      }
    }
    setFieldErr(prev => {
      const next = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(id + ':')));
      return { ...next, ...errs };
    });
    return Object.keys(errs).length === 0;
  };

  const normalise = (row: Partial<T>): Partial<T> => {
    const out: Record<string, unknown> = { ...row };
    for (const c of columns) {
      if (c.type === 'number' && out[c.key] !== undefined) {
        out[c.key] = out[c.key] === '' || out[c.key] === null ? (c.nullable ? null : 0) : Number(out[c.key]);
      }
    }
    return out as Partial<T>;
  };

  const save = async (id: string | null, row: Partial<T>) => {
    const key = id ?? 'new';
    if (!check(row, key)) return;
    setBusy(key);
    try {
      await (org.saveMaster as any)(master, id, normalise(row));
      setNotice({ tone: 'success', text: id ? 'Saved.' : 'Added.' });
      if (!id) setAdding(null);
      await reload();
      onChanged?.();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: T) => {
    const id = rowKey(r);
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    setBusy(id);
    try {
      await org.deleteMaster(master, id);
      setNotice({ tone: 'success', text: 'Deleted.' });
      await reload();
      onChanged?.();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const makeDefault = async (r: T) => {
    if (!defaultFlag) return;
    setBusy(rowKey(r));
    try {
      await org.setDefault(defaultFlag, rowKey(r));
      await reload();
      onChanged?.();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const cell = (c: Column<T>, value: unknown, onChange: (v: unknown) => void, id: string, isNew: boolean) => {
    const disabled = readOnly || (!isNew && c.editableOnCreateOnly);
    const err = fieldErr[`${id}:${c.key}`];
    const base = `w-full h-8 rounded-lg border px-2 text-xs bg-white text-slate-100 ${err ? 'border-rose-500' : 'border-slate-700'} disabled:opacity-60`;
    let input: React.ReactNode;
    if (c.type === 'checkbox') {
      input = <input type="checkbox" aria-label={c.label} className="w-4 h-4 accent-[#086343]" checked={!!value} disabled={disabled} onChange={e => onChange(e.target.checked)} />;
    } else if (c.type === 'select') {
      input = (
        <select aria-label={c.label} className={base} value={String(value ?? '')} disabled={disabled} onChange={e => onChange(e.target.value)}>
          {/* a stored value that is no longer offered stays shown (never silently replaced by the first option) */}
          {value != null && value !== '' && !(c.options ?? []).some(o => o.value === String(value)) && <option value={String(value)}>Current value (not available)</option>}
          {(value == null || value === '') && <option value="">Choose…</option>}
          {(c.options ?? []).map(o => <option key={o.value} value={o.value} disabled={o.disabled && o.value !== String(value)}>{o.label}</option>)}
        </select>
      );
    } else {
      input = (
        <input aria-label={c.label} className={base} type={c.type === 'number' ? 'number' : 'text'} step={c.step} min={c.min} max={c.max}
          placeholder={c.placeholder} value={value == null ? '' : String(value)} disabled={disabled} onChange={e => onChange(e.target.value)} />
      );
    }
    return (
      <td key={c.key} className={tdCls} style={{ width: c.width }}>
        {input}
        {err && <p className="text-[10px] text-rose-500 mt-0.5">{err}</p>}
      </td>
    );
  };

  return (
    <div className="space-y-2">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <LoadState loading={loading} error={error} onRetry={reload}>
        <div className="overflow-x-auto -mx-1">
          <table className={tableCls}>
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} className={thCls}>{c.label}{c.required && <span className="text-rose-500"> *</span>}</th>)}
                {defaultFlag && <th className={thCls}>Default</th>}
                {!readOnly && <th className={`${thCls} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !adding && (
                <tr><td className={`${tdCls} text-slate-400`} colSpan={columns.length + 2}>{emptyText ?? 'Nothing added yet.'}</td></tr>
              )}
              {visible.map(r => {
                const id = rowKey(r);
                const d = drafts[id];
                const cur = { ...r, ...d } as T;
                const dirty = !!d && Object.keys(d).some(k => (d as any)[k] !== (r as any)[k]);
                const delReason = canDelete?.(r) ?? null;
                return (
                  <tr key={id}>
                    {columns.map(c => cell(c, cur[c.key], v => setDrafts(x => ({ ...x, [id]: { ...x[id], [c.key]: v } as Partial<T> })), id, false))}
                    {defaultFlag && (
                      <td className={tdCls}>
                        {r.isDefault ? <span className="inline-flex items-center gap-1 text-[#086343] font-bold"><Star className="w-3 h-3 fill-current" /> Default</span>
                          : !readOnly && <Button size="xs" variant="ghost" onClick={() => void makeDefault(r)} disabled={busy === id}>Make default</Button>}
                      </td>
                    )}
                    {!readOnly && (
                      <td className={`${tdCls} text-right whitespace-nowrap`}>
                        <Button size="xs" variant={dirty ? 'primary' : 'outline'} disabled={!dirty || busy === id} isLoading={busy === id}
                          onClick={() => void save(id, d ?? {})} leftIcon={<Save className="w-3 h-3" />}>Save</Button>
                        <Button size="xs" variant="ghost" className="ml-1" disabled={!!delReason || busy === id} title={delReason ?? 'Delete'}
                          onClick={() => void remove(r)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {adding && (
                <tr className="bg-emerald-50/40">
                  {columns.map(c => cell(c, adding[c.key], v => setAdding(a => ({ ...a, [c.key]: v } as Partial<T>)), 'new', true))}
                  {defaultFlag && <td className={tdCls} />}
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    <Button size="xs" onClick={() => void save(null, adding)} isLoading={busy === 'new'} leftIcon={<Save className="w-3 h-3" />}>Add</Button>
                    <Button size="xs" variant="ghost" className="ml-1" onClick={() => { setAdding(null); setFieldErr({}); }}>Cancel</Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!readOnly && allowAdd && !adding && (
          <Button size="xs" variant="outline" leftIcon={<Plus className="w-3 h-3" />} onClick={() => setAdding({ ...blank })}>{addLabel}</Button>
        )}
      </LoadState>
    </div>
  );
}
