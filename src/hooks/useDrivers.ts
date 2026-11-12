// Drivers list shared by the Drivers page and vehicle forms. One fetch per change; saving a driver
// or a vehicle assignment calls invalidateDrivers() so every user of the hook reloads.
import { useCallback, useEffect, useState } from 'react';
import { fetchDrivers, type Driver } from '../services/drivers';

const events = new EventTarget();
export const invalidateDrivers = () => events.dispatchEvent(new Event('change'));

export function useDrivers(enabled = true) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try { setDrivers(await fetchDrivers()); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    void load();
    const on = () => void load();
    events.addEventListener('change', on);
    return () => events.removeEventListener('change', on);
  }, [load]);
  return { drivers, loading, error, reload: load };
}
