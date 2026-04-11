import { getConfig, AuditEvent, QuotaGuardConfig, QuotaGuardRule } from '../config.js';
import { generateStableKey } from '../keys/normalizer.js';
import { globalCache, RequestMetadata } from '../cache/memory.js';
import { globalInFlightRegistry } from '../registry/in-flight.js';
import { globalBreaker, CircuitBreakerError } from '../breaker/circuit-breaker.js';
import { globalDebouncer } from '../utils/debounce-promise.js';
import { base64ToBuffer } from '../utils/encoding.js';

import { ResponseBroadcaster } from '../streams/broadcaster.js';

export interface GuardResult {
  response?: Response;
  error?: Error;
  key?: string;
  isHit?: boolean;
  status?: 'HIT' | 'LIVE' | 'SHARED' | 'BREAKER';
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
    const baseConfig = getConfig();
    const { url: requestUrl, method } = request;
    const headersMap = this.getHeadersMap(request);

    // 1. Initial Matching
    if (!this.isGuarded(requestUrl, method, baseConfig, request)) {
      return {};
    }

    // 2. Rule-based Overrides
    const effectiveConfig = this.getEffectiveConfig(requestUrl, headersMap, baseConfig);

    try {
      // Locking: Synchronize normalization for the same endpoint to prevent races
      const lockKey = `${method}:${requestUrl}`;
      const previousLock = this.urlLocks.get(lockKey) || Promise.resolve();
      
      let resolveLock: () => void;
      const currentLock = new Promise<void>(resolve => { resolveLock = resolve; });
      this.urlLocks.set(lockKey, currentLock);

      await previousLock;

      try {
        // 3. Extract Body and Generate Key
        const bodyText = await this.safeCloneText(request);
        const key = await generateStableKey(requestUrl, method, bodyText, effectiveConfig.cacheKeyStrategy, headersMap);

        if (!key) return {};

        this.emitAudit({ type: 'request_started', key, url: requestUrl, timestamp: Date.now() });

        const currentSnapshot: RequestMetadata = { url: requestUrl, method, headers: headersMap };

        // 4. Debounce
        if (effectiveConfig.debounceMs > 0) {
          await globalDebouncer.debounce(key, effectiveConfig.debounceMs);
          this.emitAudit({ type: 'debounced', key, url: requestUrl, timestamp: Date.now() });
        }

        // 5. Circuit Breaker (Safety Guard - Mandatory)
        
        // 5a. Global Breaker
        if (globalBreaker.isGlobalOpen(effectiveConfig.globalBreakerMaxFailures, effectiveConfig.breakerResetTimeoutMs)) {
          this.emitAudit({ type: 'global_breaker_opened', key, url: requestUrl, timestamp: Date.now() });
          return { error: new CircuitBreakerError(`Quota Guard: GLOBAL circuit breaker OPEN. Process-wide safety triggered.`), key, status: 'BREAKER' };
        }

        // 5b. Per-Key Breaker
        if (globalBreaker.isOpen(key, effectiveConfig.breakerMaxFailures, effectiveConfig.breakerResetTimeoutMs)) {
          this.emitAudit({ type: 'breaker_opened', key, url: requestUrl, timestamp: Date.now() });
          return { error: new CircuitBreakerError(`Quota Guard: Circuit breaker OPEN for key ${key}.`), key, status: 'BREAKER' };
        }

        // 6. Cache Check (Optimization Guard - Bypassable)
        const hasBypassHeader = effectiveConfig.bypassCacheHeaders?.some(h => headersMap[h] !== undefined);
        const hasExplicitBypass = headersMap['x-quota-guard-bypass'] !== undefined;
        
        const activeCache = effectiveConfig.cacheAdapter || globalCache;
        const cached = await activeCache.get(key, effectiveConfig.cacheTtlMs);

        if (cached && !hasExplicitBypass) {
          if (hasBypassHeader) {
            // Guard Priority: Business-level bypass headers are ignored to protect the budget.
            // Only config-driven bypass or internal bypass headers are honored.
            this.logIntentConflict('BYPASS_IGNORED', requestUrl, key, 'business-level cache-control', 'Served from cache (Guard Safety Policy)');
            const buffer = this.base64ToBuffer(cached.responsePayloadBase64);
            const headers = new Headers(cached.headers);
            headers.set('X-Quota-Guard', 'HIT');
            return { 
              response: new Response(buffer, { status: cached.status, headers }), 
              key, 
              isHit: true,
              status: 'HIT' 
            };
          } else {
            this.logFingerprintConflict(currentSnapshot, cached.requestSnapshot, key);
            this.emitAudit({ type: 'cache_hit', key, url: requestUrl, timestamp: Date.now() });
            const buffer = this.base64ToBuffer(cached.responsePayloadBase64);
            const headers = new Headers(cached.headers);
            headers.set('X-Quota-Guard', 'HIT');
            return { 
              response: new Response(buffer, { status: cached.status, headers }), 
              key, 
              isHit: true,
              status: 'HIT' 
            };
          }
        }

        // 7. In-Flight (Dedup) Check - Using Broadcaster for "Streaming Live" (Safety Guard - Mandatory)
        // Skip In-Flight check if explicit bypass is requested to allow a "True Isolated Live Call".
        const entry = !hasExplicitBypass ? globalInFlightRegistry.get(key) : null;
        if (entry) {
          this.logFingerprintConflict(currentSnapshot, entry.snapshot, key);
          this.emitAudit({ type: 'in_flight_shared', key, url: requestUrl, timestamp: Date.now() });
          
          // Use configurable timeout from config. Default: 60s
          const timeoutMs = effectiveConfig.inFlightTimeoutMs || 60000;
          const broadcaster = await Promise.race([
            entry.broadcaster instanceof Promise ? entry.broadcaster : Promise.resolve(entry.broadcaster),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Quota Guard: In-flight timeout after ${timeoutMs}ms`)), timeoutMs))
          ]);
          
          return { 
            response: broadcaster.subscribe({ 'X-Quota-Guard': 'SHARED' }), 
            key, 
            isHit: true,
            broadcaster,
            status: 'SHARED'
          };
        }

        // 8. Early Lock: If it's a miss, we register a promise that others will await
        let resolveBroadcaster: ((b: ResponseBroadcaster) => void) | undefined;
        const broadcasterPromise = new Promise<ResponseBroadcaster>((resolve) => {
          resolveBroadcaster = resolve;
        });
        globalInFlightRegistry.set(key, broadcasterPromise, currentSnapshot);

        return { key, resolveBroadcaster, status: 'LIVE' };
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

  private isGuarded(urlStr: string, method: string, config: QuotaGuardConfig, request?: Request): boolean {
    if (!config.enabled || method === 'OPTIONS') return false;
    if (request && request.headers.get('x-quota-guard-internal') === 'true') return false;
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

  private getEffectiveConfig(url: string, headers: Record<string, string>, baseConfig: QuotaGuardConfig): QuotaGuardConfig {
    if (!baseConfig.rules || baseConfig.rules.length === 0) return baseConfig;

    let effective = { ...baseConfig };
    for (const rule of baseConfig.rules) {
      if (this.matchRule(url, headers, rule)) {
        effective = { ...effective, ...rule.override };
      }
    }
    return effective;
  }

  private matchRule(urlStr: string, headers: Record<string, string>, rule: QuotaGuardRule): boolean {
    const { match } = rule;
    
    // Match URL
    if (match.url) {
      let regex: RegExp;
      if (match.url instanceof RegExp) {
        regex = match.url;
      } else {
        const urlStr = String(match.url);
        if (urlStr.startsWith('/') && urlStr.endsWith('/')) {
          regex = new RegExp(urlStr.slice(1, -1));
        } else {
          regex = new RegExp(urlStr);
        }
      }
      if (!regex.test(urlStr)) return false;
    }

    // Match Headers
    if (match.headers) {
      for (const [key, val] of Object.entries(match.headers)) {
        const actual = headers[key.toLowerCase()];
        if (actual === undefined) return false;
        const regex = val instanceof RegExp ? val : new RegExp(val);
        if (!regex.test(actual)) return false;
      }
    }

    return true;
  }

  private getHeadersMap(request: Request): Record<string, string> {
    const map: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      map[k.toLowerCase()] = v;
    });
    return map;
  }

  private logFingerprintConflict(current: RequestMetadata, original: RequestMetadata | undefined, key: string) {
    if (!original) return;
    const diffs: string[] = [];
    
    // Check key headers and common sensitive headers
    const config = getConfig();
    const checkHeaders = ['authorization', 'x-api-key', ...(config.keyHeaders || []).map(h => h.toLowerCase())];
    
    for (const h of checkHeaders) {
      const v1 = current.headers[h];
      const v2 = original.headers[h];
      if (v1 !== v2) {
        diffs.push(`- [Header] '${h}': (Current: '${v1 || 'n/a'}') vs (Original: '${v2 || 'n/a'}')`);
      }
    }

    if (diffs.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `┌──────────────────────────────────────────────────────────────────┐\n` +
        `│ [Quota Guard] [FINGERPRINT_COLLISION]                            │\n` +
        `│ ──────────────────────────────────────────────────────────────── │\n` +
        `│ Target  : ${current.method} ${current.url}\n` +
        `│ Conflict: Key [${key.slice(0, 7)}] matches, but metadata differs.      │\n` +
        `│                                                                  │\n` +
        `│ Mismatched Parameters:                                           │\n` +
        `│ ${diffs.join('\n│ ')}\n` +
        `│                                                                  │\n` +
        `│ Recommendation: Acceptable in DEV to save tokens. To isolate,    │\n` +
        `│ add these fields to 'keyHeaders' in your config.                 │\n` +
        `└──────────────────────────────────────────────────────────────────┘`
      );
    }
  }

  private logIntentConflict(type: string, url: string, key: string, trigger: string, action: string) {
    // eslint-disable-next-line no-console
    console.warn(
      `┌──────────────────────────────────────────────────────────────────┐\n` +
      `│ [Quota Guard] [${type}]                                   │\n` +
      `│ ──────────────────────────────────────────────────────────────── │\n` +
      `│ Target  : ${url}\n` +
      `│ Trigger : Found '${trigger}' in request headers.    │\n` +
      `│ Action  : ${action} for Key [${key.slice(0, 7)}].  │\n` +
      `│                                                                  │\n` +
      `│ How to Bypass:                                                   │\n` +
      `│ 1. Use Header 'X-Quota-Guard-Bypass: true'                       │\n` +
      `│ 2. Or configure a 'rule' in .quotaguardrc for this endpoint.     │\n` +
      `└──────────────────────────────────────────────────────────────────┘`
    );
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
