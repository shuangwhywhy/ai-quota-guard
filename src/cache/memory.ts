import { SerializedCacheEntry } from './types.js';
import { BaseCache } from './base.js';

export class MemoryCache extends BaseCache {
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

  async set(key: string, data: SerializedCacheEntry): Promise<void> {
    this.store.set(key, data);
    this.triggerSweep();
  }

  protected async _get(key: string): Promise<SerializedCacheEntry | null> {
    this.triggerSweep();
    return this.store.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

export const globalCache = new MemoryCache();

