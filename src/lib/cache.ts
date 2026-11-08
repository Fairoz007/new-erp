// Per-user snapshot of the loaded collections.
// Stored in IndexedDB. Version bumped to v3 to guarantee all stale operational data
// (vehicles, invoices, accounts, P&L, etc.) is completely purged across all client browsers.
const DB_NAME = 'fleetx-cache-v4';
const STORE = 'collections';
const VERSION = 1;

// Purge any legacy IndexedDB caches from previous versions
if (typeof indexedDB !== 'undefined') {
  try {
    indexedDB.deleteDatabase('fleetx-cache');
    indexedDB.deleteDatabase('fleetx-cache-v2');
    indexedDB.deleteDatabase('fleetx-cache-v3');
  } catch {
    /* ignore */
  }
}

// Operational tables that must NEVER be loaded from stale cache
// (Vehicles are allowed so newly seeded/added vehicle details persist)
const DISALLOWED_CACHE_KEYS = new Set([
  'tyres',
  'tyreEvents',
  'oilChanges',
  'maintenanceRecords',
  'workOrders',
  'accidents',
  'expenses',
  'suppliers',
  'customers',
  'invoices',
  'reconciliations',
  'payments',
  'bankAccounts',
  'chartOfAccounts',
  'journalEntries',
  'fixedAssets',
  'depreciationRuns',
  'employees',
  'payrollRuns',
  'documents',
  'timeline',
  'notifications',
]);

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export async function readCache(userId: string): Promise<Record<string, unknown[]>> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const out: Record<string, unknown[]> = {};
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor(IDBKeyRange.bound(`${userId}:`, `${userId}:\uffff`));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        const key = String(cur.key).slice(userId.length + 1);
        // Only return non-disallowed keys (e.g. companies, profiles)
        if (!DISALLOWED_CACHE_KEYS.has(key)) {
          out[key] = cur.value as unknown[];
        }
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out;
  } catch {
    return {};
  }
}

export async function writeCache(userId: string, values: Record<string, unknown[]>): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [k, v] of Object.entries(values)) {
      if (!DISALLOWED_CACHE_KEYS.has(k)) {
        store.put(v, `${userId}:${k}`);
      }
    }
    await done(tx);
    db.close();
  } catch {
    /* cache is an optimisation only */
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
    db.close();
  } catch {
    /* ignore */
  }
}
