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
    let resolver: (value: any) => void;
    let rejecter: (reason?: any) => void;
    // Store a Promise that predictably resolves to ArrayBuffer/cacheData
    const cacheDataPromise = new Promise<any>((res, rej) => {
      resolver = res;
      rejecter = rej;
    });

    // Mute unhandled rejections if no deduplicated request awaits the shared promise
    cacheDataPromise.catch(() => {});

    globalInFlightRegistry.set(key, cacheDataPromise);

    try {
      const response = await nativeFetch(input, init);
      
      const headers: Record<string, string> = {};
      response.headers.forEach((val, k) => { headers[k] = val; });
      const status = response.status;
      
      const cacheResponseData = (buffer: ArrayBuffer) => {
        const cacheData = {
          responsePayload: buffer,
          headers,
          status,
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
      };

      if (response.body) {
        const [stream1, stream2] = response.body.tee();
        const liveResponse = new Response(stream1, { status, statusText: response.statusText, headers: response.headers });
        
        // Background cache
        (async () => {
          try {
            const buffer = await new Response(stream2).arrayBuffer();
            const data = cacheResponseData(buffer);
            resolver!(data);
          } catch (err: any) {
            globalBreaker.recordFailure(key);
            emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { error: err.message } });
            rejecter!(err);
          } finally {
            globalInFlightRegistry.delete(key);
          }
        })();
        
        return liveResponse;
      } else {
        const buffer = await response.arrayBuffer();
        const data = cacheResponseData(buffer);
        resolver!(data);
        globalInFlightRegistry.delete(key);
        return buildResponse(data.responsePayload, { status, headers });
      }
    } catch (err: any) {
      globalBreaker.recordFailure(key);
      emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { error: err.message } });
      globalInFlightRegistry.delete(key);
      rejecter!(err);
      throw err;
    }
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
