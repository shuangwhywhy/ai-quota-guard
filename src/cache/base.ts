import { ICacheAdapter, SerializedCacheEntry } from './types.js';

export abstract class BaseCache implements ICacheAdapter {
  /**
   * Internal get method to be implemented by sub-classes.
   * Should return the raw entry without TTL checking.
   */
  protected abstract _get(key: string): Promise<SerializedCacheEntry | null>;

  /**
   * Common implementation of get with TTL verification.
   */
  async get(key: string, ttlMs: number): Promise<SerializedCacheEntry | null> {
    const entry = await this._get(key);
    if (!entry) return null;

    const now = Date.now();

    if (now - entry.timestamp > ttlMs) {
      await this.delete(key);
      return null;
    }

    return entry;
  }

  abstract set(key: string, data: SerializedCacheEntry): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract clear(): Promise<void>;
}
