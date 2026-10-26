// Per-user snapshot of the loaded collections, so the app opens with last-known data instantly
// and refreshes in the background. Stored in IndexedDB (structured clone, no size cliff of
// localStorage). Cleared on sign-out. Every call is best-effort: a failure just means a cold load.
const DB_NAME = 'fleetx-cache';
const STORE = 'collections';
const VERSION = 1;

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
        out[String(cur.key).slice(userId.length + 1)] = cur.value as unknown[];
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
    for (const [k, v] of Object.entries(values)) store.put(v, `${userId}:${k}`);
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
