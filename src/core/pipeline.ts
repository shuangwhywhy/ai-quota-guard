import { getConfig, AuditEvent, QuotaGuardConfig } from '../config';
import { generateStableKey } from '../keys/normalizer';
import { globalCache, SerializedCacheEntry } from '../cache/memory';
import { globalInFlightRegistry } from '../registry/in-flight';
import { globalBreaker, CircuitBreakerError } from '../breaker/circuit-breaker';
import { globalDebouncer } from '../utils/debounce-promise';
import { base64ToBuffer } from '../utils/encoding';

import { ResponseBroadcaster } from '../streams/broadcaster';

export interface GuardResult {
  response?: Response;
  error?: Error;
  key?: string;
  isHit?: boolean;
  broadcaster?: ResponseBroadcaster;
  resolveBroadcaster?: (b: ResponseBroadcaster) => void;
}

export type EmitAuditFn = (event: AuditEvent) => void;

/**
 * The core engine that orchestrates the guard logic:
 * Match -> Key -> Debounce -> Breaker -> Cache -> In-Flight -> Live
 */
export class GuardPipeline {
  private urlLocks = new Map<string, Promise<void>>();

  constructor(private emitAudit: EmitAuditFn) { }

  async processRequest(request: Request): Promise<GuardResult> {
    const config = getConfig();
    const { url: requestUrl, method } = request;

    // 1. Matching
    if (!this.isGuarded(requestUrl, method, config)) {
      return {};
    }

    try {
      // Locking: Synchronize normalization for the same endpoint to prevent races
      const lockKey = `${method}:${requestUrl}`;
      const previousLock = this.urlLocks.get(lockKey) || Promise.resolve();
      
      let resolveLock: () => void;
      const currentLock = new Promise<void>(resolve => { resolveLock = resolve; });
      this.urlLocks.set(lockKey, currentLock);

      await previousLock;

      try {
        // 2. Extract Body and Generate Key
        const bodyText = await this.safeCloneText(request);
        const key = await generateStableKey(requestUrl, method, bodyText, config.cacheKeyStrategy);

        if (!key) return {};

        // 3. Debounce
        if (config.debounceMs > 0) {
          await globalDebouncer.debounce(key, config.debounceMs);
        }

        // 4. Circuit Breaker
        if (globalBreaker.isOpen(key, config.breakerMaxFailures, config.breakerResetTimeoutMs)) {
          this.emitAudit({ type: 'breaker_opened', key, url: requestUrl, timestamp: Date.now() });
          return { error: new CircuitBreakerError(`Quota Guard: Circuit breaker OPEN for key ${key}.`), key };
        }

        // 5. Cache Check
        const activeCache = config.cacheAdapter || globalCache;
        const cached = await activeCache.get(key, config.cacheTtlMs);
        if (cached) {
          this.emitAudit({ type: 'cache_hit', key, url: requestUrl, timestamp: Date.now() });
          const buffer = this.base64ToBuffer(cached.responsePayloadBase64);
          return { 
            response: new Response(buffer, { status: cached.status, headers: cached.headers }), 
            key, 
            isHit: true 
          };
        }

        // 6. In-Flight (Dedup) Check - Using Broadcaster for "Streaming Live"
        const entry = globalInFlightRegistry.get(key);
        if (entry) {
          this.emitAudit({ type: 'in_flight_shared', key, url: requestUrl, timestamp: Date.now() });
          const broadcaster = await Promise.race([
            entry instanceof Promise ? entry : Promise.resolve(entry),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Quota Guard: In-flight timeout')), 10000))
          ]);
          
          return { 
            response: broadcaster.subscribe(), 
            key, 
            isHit: true,
            broadcaster
          };
        }

        // 7. Early Lock: If it's a miss, we register a promise that others will await
        let resolveBroadcaster: ((b: ResponseBroadcaster) => void) | undefined;
        const broadcasterPromise = new Promise<ResponseBroadcaster>((resolve) => {
          resolveBroadcaster = resolve;
        });
        globalInFlightRegistry.set(key, broadcasterPromise);

        return { key, resolveBroadcaster };
      } finally {
        resolveLock!();
        if (this.urlLocks.get(lockKey) === currentLock) {
          this.urlLocks.delete(lockKey);
        }
      }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  private isGuarded(urlStr: string, method: string, config: QuotaGuardConfig): boolean {
    if (!config.enabled || method === 'OPTIONS') return false;
    const endpoints = config.aiEndpoints;
    try {
      const url = urlStr.startsWith('http') ? new URL(urlStr) : new URL(urlStr, typeof location !== 'undefined' ? location.origin : 'http://localhost');
      
      return endpoints.some((ep: string | RegExp) => {
        if (ep instanceof RegExp) {
          return ep.test(url.hostname) || ep.test(url.href);
        }
        const epStr = String(ep);
        if (epStr.startsWith('/') && epStr.endsWith('/')) {
          const regex = new RegExp(epStr.slice(1, -1));
          return regex.test(url.hostname) || regex.test(url.href);
        }
        return url.hostname.includes(epStr) || url.href.includes(epStr);
      });
    } catch {
      return false;
    }
  }

  private async safeCloneText(request: Request): Promise<string | null> {
    try {
      const cloned = request.clone();
      return await cloned.text();
    } catch {
      return null;
    }
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    return base64ToBuffer(base64);
  }
}
