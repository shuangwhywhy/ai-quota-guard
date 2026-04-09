export interface SerializedCacheEntry {
  responsePayloadBase64: string;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
  ttlMs?: number;
}

export interface ICacheAdapter {
  get(key: string, ttlMs: number): SerializedCacheEntry | null | Promise<SerializedCacheEntry | null>;
  set(key: string, data: SerializedCacheEntry): void | Promise<void>;
  clear?(): void | Promise<void>;
}

export class MemoryCache implements ICacheAdapter {
  private store: Map<string, SerializedCacheEntry> = new Map();
  private opCount = 0;
  private readonly SWEEP_THRESHOLD = 50;

  private triggerSweep() {
    this.opCount++;
    if (this.opCount >= this.SWEEP_THRESHOLD) {
      this.opCount = 0;
      const now = Date.now();
      for (const [k, v] of this.store.entries()) {
        const entryTtl = v.ttlMs || 3600000; // Fallback to 1 hr if not present
        if (now - v.timestamp > entryTtl) {
          this.store.delete(k);
        }
      }
    }
  }

  set(key: string, data: SerializedCacheEntry): void {
    this.store.set(key, data);
    this.triggerSweep();
  }

  get(key: string, ttlMs: number): SerializedCacheEntry | null {
    this.triggerSweep();
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
