import { getConfig, setConfig, QuotaGuardConfig, AuditEvent } from '../config';
import { generateStableKey } from '../keys/normalizer';
import { globalCache } from '../cache/memory';
import { globalInFlightRegistry } from '../registry/in-flight';
import { globalBreaker, CircuitBreakerError } from '../breaker/circuit-breaker';

type FetchFn = typeof globalThis.fetch;
let originalFetch: FetchFn | null = null;

const emitAudit = (config: QuotaGuardConfig, event: AuditEvent) => {
  if (config.auditHandler) {
    try {
      config.auditHandler(event);
    } catch (e) {
      // Ignore errors in audit handler
    }
  }
};

const isAIEndpoint = (urlStr: string, endpoints: string[]): boolean => {
  try {
    const url = new URL(urlStr);
    return endpoints.some(ep => url.hostname.includes(ep) || url.href.includes(ep));
  } catch {
    return false;
  }
};

async function readBody(requestInit?: RequestInit): Promise<any> {
  if (!requestInit || !requestInit.body) return null;
  const body = requestInit.body;
  if (typeof body === 'string') return body;
  // If it's already an object (interceptors sometimes see this), just return
  if (typeof body === 'object' && !(body instanceof ReadableStream) && !(body instanceof FormData) && !(body instanceof Blob)) {
    return body;
  }
  return String(body);
}

const buildResponse = (buffer: ArrayBuffer, init: ResponseInit): Response => {
  // Clone the array buffer to prevent multiple consumers from locking it
  const newBuffer = buffer.slice(0);
  return new Response(newBuffer, init);
};

export const createFetchInterceptor = (nativeFetch: FetchFn): FetchFn => {
  return async function interceptor(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const config = getConfig();
    
    const requestUrl = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET';

    if (!config.enabled || !isAIEndpoint(requestUrl, config.aiEndpoints) || method === 'OPTIONS') {
      return nativeFetch(input, init);
    }

    const reqBody = await readBody(init);
    const key = generateStableKey(requestUrl, method, reqBody);

    if (!key) {
      return nativeFetch(input, init);
    }

    // 1. Circuit Breaker Check
    if (globalBreaker.isOpen(key, config.breakerMaxFailures, config.breakerResetTimeoutMs)) {
      emitAudit(config, { type: 'breaker_opened', key, url: requestUrl, timestamp: Date.now() });
      throw new CircuitBreakerError(`Quota Guard: Circuit breaker OPEN for key ${key}. Request blocked.`);
    }

    // 2. Cache Check
    const cached = globalCache.get(key, config.cacheTtlMs);
    if (cached) {
      emitAudit(config, { type: 'cache_hit', key, url: requestUrl, timestamp: Date.now() });
      return buildResponse(cached.responsePayload, { status: cached.status, headers: cached.headers });
    }

    // 3. In-flight (Debounce & Dedup) Check
    const inFlightPromise = globalInFlightRegistry.get(key);
    if (inFlightPromise) {
      emitAudit(config, { type: 'in_flight_shared', key, url: requestUrl, timestamp: Date.now() });
      // We must wait for the existing promise to resolve to ArrayBuffer, then build a response
      const sharedCached = await inFlightPromise;
      return buildResponse(sharedCached.responsePayload, { status: sharedCached.status, headers: sharedCached.headers });
    }

    emitAudit(config, { type: 'live_called', key, url: requestUrl, timestamp: Date.now() });

    // 4. Execute Native Call
    const execLive = async () => {
      try {
        const response = await nativeFetch(input, init);
        
        // Read into memory for cache and sharing
        const buffer = await response.arrayBuffer();
        
        // Extract plain headers
        const headers: Record<string, string> = {};
        response.headers.forEach((val, k) => { headers[k] = val; });

        const cacheData = {
          responsePayload: buffer,
          headers,
          status: response.status,
          timestamp: Date.now()
        };

        if (response.ok) {
          globalBreaker.recordSuccess(key);
          globalCache.set(key, cacheData);
        } else {
          globalBreaker.recordFailure(key);
          emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { status: response.status } });
        }

        return cacheData;
      } catch (err: any) {
        globalBreaker.recordFailure(key);
        emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { error: err.message } });
        throw err;
      } finally {
        globalInFlightRegistry.delete(key);
      }
    };

    const promise = execLive();
    globalInFlightRegistry.set(key, promise);

    const resultData = await promise;
    return buildResponse(resultData.responsePayload, { status: resultData.status, headers: resultData.headers });
  };
};

export const hookFetch = () => {
  if (originalFetch) return; // already hooked
  if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createFetchInterceptor(originalFetch);
  }
};

export const unhookFetch = () => {
  if (originalFetch && typeof globalThis !== 'undefined') {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
};
