import { ICacheAdapter, SerializedCacheEntry } from './memory';

export class BrowserCache implements ICacheAdapter {
  private dbName = 'quota-guard-cache';
  private storeName = 'responses';
  private db: IDBDatabase | null = null;

  constructor() {}

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    if (typeof indexedDB === 'undefined') {
      throw new Error('Quota Guard: IndexedDB is not available in this environment.');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string, ttlMs: number): Promise<SerializedCacheEntry | null> {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as SerializedCacheEntry | undefined;
        if (!entry) return resolve(null);

        if (Date.now() - entry.timestamp > ttlMs) {
          this.delete(key);
          return resolve(null);
        }
        resolve(entry);
      };
      request.onerror = () => resolve(null);
    });
  }

  async set(key: string, data: SerializedCacheEntry): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.openDb();
    const transaction = db.transaction(this.storeName, 'readwrite');
    transaction.objectStore(this.storeName).delete(key);
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    const transaction = db.transaction(this.storeName, 'readwrite');
    transaction.objectStore(this.storeName).clear();
  }
}
