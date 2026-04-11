export interface RequestMetadata {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export interface SerializedCacheEntry {
  responsePayloadBase64: string;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
  ttlMs?: number;
  /** Snapshot of the request that generated this entry, used for collision detection. */
  requestSnapshot?: RequestMetadata;
}

export interface ICacheAdapter {
  get(key: string, ttlMs: number): Promise<SerializedCacheEntry | null>;
  set(key: string, data: SerializedCacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
