export interface SerializedCacheEntry {
  responsePayloadBase64: string;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
}

export interface ICacheAdapter {
  get(key: string, ttlMs: number): SerializedCacheEntry | null | Promise<SerializedCacheEntry | null>;
  set(key: string, data: SerializedCacheEntry): void | Promise<void>;
  clear?(): void | Promise<void>;
}

export class MemoryCache implements ICacheAdapter {
  private store: Map<string, SerializedCacheEntry> = new Map();

  set(key: string, data: SerializedCacheEntry): void {
    this.store.set(key, data);
  }

  get(key: string, ttlMs: number): SerializedCacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  clear(): void {
    this.store.clear();
  }
}

export const globalCache = new MemoryCache();
