import { SerializedCacheEntry } from './types.js';
import { BaseCache } from './base.js';

export class BrowserCache extends BaseCache {
  private dbName = 'quota-guard-cache';
  private storeName = 'responses';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    super();
  }

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          if (typeof indexedDB === 'undefined') {
            return reject(new Error('Quota Guard: IndexedDB is not available in this environment.'));
          }
          const request = indexedDB.open(this.dbName, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(this.storeName)) {
              db.createObjectStore(this.storeName);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        this.db = db;
        return db;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  protected async _get(key: string): Promise<SerializedCacheEntry | null> {
    const db = await this.openDb();
    return new Promise((resolve) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve((request.result as SerializedCacheEntry) || null);
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

