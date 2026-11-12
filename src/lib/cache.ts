// Business data is never cached in the browser: Supabase is the only source of truth, and
// localStorage / IndexedDB may hold UI preferences only. Older builds kept a per-user snapshot
// of every collection in IndexedDB; purgeLegacyCaches() deletes those databases.
const LEGACY_DATABASES = ['fleetx-cache', 'fleetx-cache-v2', 'fleetx-cache-v3', 'fleetx-cache-v4'];
const LEGACY_LOCAL_KEYS = ['fleetx_erp_data', 'fleetx-data', 'erp_data'];

export function purgeLegacyCaches(): void {
  try {
    if (typeof indexedDB !== 'undefined') LEGACY_DATABASES.forEach(n => indexedDB.deleteDatabase(n));
  } catch { /* ignore */ }
  try {
    if (typeof localStorage !== 'undefined') LEGACY_LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
