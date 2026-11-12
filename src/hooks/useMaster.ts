// Any organization master list (departments, designations, leave types, pay components, …) with a
// shared cache that is dropped when the master changes (org.masterEvents).
import { useEffect, useState } from 'react';
import * as org from '../services/org';
import type { MasterName } from '../services/org';

const cache = new Map<MasterName, Promise<unknown[]>>();
org.masterEvents.addEventListener('change', e => cache.delete((e as CustomEvent).detail as MasterName));

export function useMaster<T = any>(name: MasterName, opts: { activeOnly?: boolean; keep?: string[] } = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === name) setVersion(v => v + 1); };
    org.masterEvents.addEventListener('change', on);
    return () => org.masterEvents.removeEventListener('change', on);
  }, [name]);
  useEffect(() => {
    let live = true;
    if (!cache.has(name)) cache.set(name, org.listMaster(name).catch(err => { cache.delete(name); throw err; }) as Promise<unknown[]>);
    cache.get(name)!.then(r => { if (live) { setRows(r as T[]); setError(null); } }).catch(err => { if (live) setError((err as Error).message); });
    return () => { live = false; };
  }, [name, version]);
  const keep = new Set(opts.keep ?? []);
  const list = opts.activeOnly
    ? rows.filter((r: any) => r.active !== false || keep.has(r.id) || keep.has(r.name))
    : rows;
  return { rows: list, all: rows, error };
}
