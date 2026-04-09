export interface CacheEntry {
  responsePayload: any; // Raw arraybuffer or JSON depending on interception
  headers: Record<string, string>;
  status: number;
  timestamp: number;
}

export class MemoryCache {
  private store: Map<string, CacheEntry> = new Map();

  set(key: string, data: CacheEntry): void {
    this.store.set(key, data);
  }

  get(key: string, ttlMs: number): CacheEntry | null {
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
