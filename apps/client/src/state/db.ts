/**
 * Tiny IndexedDB key-value store (falls back to localStorage when IndexedDB is unavailable,
 * e.g. some private modes). Values are structured-cloned objects.
 */
const DB_NAME = 'afterlife-overdrive';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) {
    try {
      const raw = localStorage.getItem(`ao.kv.${key}`);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) {
    try {
      localStorage.setItem(`ao.kv.${key}`, JSON.stringify(value));
    } catch {
      /* quota */
    }
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
}

export async function kvDelete(key: string): Promise<void> {
  const db = await open();
  if (!db) {
    localStorage.removeItem(`ao.kv.${key}`);
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
