import { getConfig, QuotaGuardConfig, AuditEvent } from '../config';
import { generateStableKey } from '../keys/normalizer';
import { globalCache, SerializedCacheEntry } from '../cache/memory';
import { globalInFlightRegistry } from '../registry/in-flight';
import { globalBreaker, CircuitBreakerError } from '../breaker/circuit-breaker';
import { globalDebouncer } from '../utils/debounce-promise';

// Lazy-loaded mswjs interceptor instance (only in Node.js environments)
let batchInterceptor: any = null;

// Legacy fetch-only fallback for browser environments
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

function bufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function extractRequestData(input: RequestInfo | URL, init?: RequestInit): Promise<{ url: string, method: string, bodyText: string | null }> {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
  const method = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET';
  let bodyText: string | null = null;

  if (typeof input === 'object' && 'clone' in input && typeof input.clone === 'function') {
    const clonedReq = (input as Request).clone();
    try {
      const buf = await clonedReq.arrayBuffer();
      if (buf.byteLength > 0) {
        bodyText = new TextDecoder().decode(buf);
      }
    } catch { /* ignore */ }
  } else if (init && init.body) {
    if (typeof init.body === 'string') {
      bodyText = init.body;
    } else if (typeof init.body === 'object' && !(init.body instanceof ReadableStream) && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
      bodyText = String(init.body);
    }
  }

  return { url, method, bodyText };
}

const buildResponse = (buffer: ArrayBuffer, init: ResponseInit): Response => {
  // Clone the array buffer to prevent multiple consumers from locking it
  const newBuffer = buffer.slice(0);
  return new Response(newBuffer, init);
};

/**
 * Core pipeline handler: applies debounce → circuit breaker → cache → dedup → live fetch.
 * Unified for both Fetch API and Node.js http/https via @mswjs/interceptors.
 */
async function handleRequest(
  nativeFetch: FetchFn,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const config = getConfig();

  let requestUrl = '';
  let method = 'GET';
  let key: string | null = null;

  try {
    const extracted = await extractRequestData(input, init);
    requestUrl = extracted.url;
    method = extracted.method;

    if (!config.enabled || !isAIEndpoint(requestUrl, config.aiEndpoints) || method === 'OPTIONS') {
      return nativeFetch(input, init);
    }

    key = await generateStableKey(requestUrl, method, extracted.bodyText, config.cacheKeyStrategy);

    if (!key) {
      return nativeFetch(input, init);
    }
  } catch (e) {
    // Fail-safe: Any pre-flight internal error gracefully degrades to transparent native fetch
    return nativeFetch(input, init);
  }

  // 0. Debounce Intercept (Promise Sharing Gate)
  if (config.debounceMs > 0) {
    await globalDebouncer.debounce(key, config.debounceMs);
  }

  // 1. Circuit Breaker Check
  if (globalBreaker.isOpen(key, config.breakerMaxFailures, config.breakerResetTimeoutMs)) {
    emitAudit(config, { type: 'breaker_opened', key, url: requestUrl, timestamp: Date.now() });
    throw new CircuitBreakerError(`Quota Guard: Circuit breaker OPEN for key ${key}. Request blocked.`);
  }

  // 2. Cache Check
  const activeCache = config.cacheAdapter || globalCache;
  const cached = await activeCache.get(key, config.cacheTtlMs);
  if (cached) {
    emitAudit(config, { type: 'cache_hit', key, url: requestUrl, timestamp: Date.now() });
    const buffer = base64ToBuffer(cached.responsePayloadBase64);
    return buildResponse(buffer, { status: cached.status, headers: cached.headers });
  }

  // 3. In-flight (Dedup) Check
  const inFlightPromise = globalInFlightRegistry.get(key);
  if (inFlightPromise) {
    emitAudit(config, { type: 'in_flight_shared', key, url: requestUrl, timestamp: Date.now() });
    const sharedCached: SerializedCacheEntry = await inFlightPromise;
    const buffer = base64ToBuffer(sharedCached.responsePayloadBase64);
    return buildResponse(buffer, { status: sharedCached.status, headers: sharedCached.headers });
  }

  emitAudit(config, { type: 'live_called', key, url: requestUrl, timestamp: Date.now() });

  // 4. Execute Native Call
  let resolver: (value: SerializedCacheEntry) => void;
  let rejecter: (reason?: any) => void;
  const cacheDataPromise = new Promise<SerializedCacheEntry>((res, rej) => {
    resolver = res;
    rejecter = rej;
  });

  // Mute unhandled rejections if no deduplicated request awaits the shared promise
  cacheDataPromise.catch(() => { });

  globalInFlightRegistry.set(key, cacheDataPromise);

  try {
    const response = await nativeFetch(input, init);

    const headers: Record<string, string> = {};
    response.headers.forEach((val, k) => { headers[k] = val; });
    const status = response.status;

    const cacheResponseData = async (buffer: ArrayBuffer) => {
      const cacheData: SerializedCacheEntry = {
        responsePayloadBase64: bufferToBase64(buffer),
        headers,
        status,
        timestamp: Date.now(),
        ttlMs: config.cacheTtlMs
      };
      if (response.ok) {
        globalBreaker.recordSuccess(key);
        await activeCache.set(key, cacheData);
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
          const data = await cacheResponseData(buffer);
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
      const data = await cacheResponseData(buffer);
      resolver!(data);
      globalInFlightRegistry.delete(key);
      const reconstructedBuffer = base64ToBuffer(data.responsePayloadBase64);
      return buildResponse(reconstructedBuffer, { status, headers });
    }
  } catch (err: any) {
    globalBreaker.recordFailure(key);
    emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { error: err.message } });
    globalInFlightRegistry.delete(key);
    rejecter!(err);
    throw err;
  }
}

/**
 * Creates a fetch-wrapping interceptor function (used by legacy Proxy path and by mswjs pipeline).
 */
export const createFetchInterceptor = (nativeFetch: FetchFn): FetchFn => {
  return async function interceptor(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return handleRequest(nativeFetch, input, init);
  };
};

/**
 * Hooks fetch globally. In Node.js, also hooks http/https via @mswjs/interceptors.
 * In browsers, uses a lightweight Proxy wrapper on globalThis.fetch.
 */
export const hookFetch = () => {
  if (originalFetch || batchInterceptor) return; // already hooked

  // Attempt to use @mswjs/interceptors for full-spectrum Node.js coverage (http + https + fetch)
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

  if (isNode) {
    try {
      // Dynamic require to avoid bundling issues in browser builds
      const { BatchInterceptor } = require('@mswjs/interceptors');
      const { ClientRequestInterceptor } = require('@mswjs/interceptors/ClientRequest');
      const { FetchInterceptor } = require('@mswjs/interceptors/fetch');

      batchInterceptor = new BatchInterceptor({
        name: 'quota-guard',
        interceptors: [
          new ClientRequestInterceptor(),
          new FetchInterceptor(),
        ],
      });

      batchInterceptor.on('request', async ({ request, controller }: { request: Request, controller: any }) => {
        try {
          // Clone the request body before it's consumed
          const clonedRequest = request.clone();
          let bodyText: string | null = null;
          try {
            const text = await clonedRequest.text();
            if (text) bodyText = text;
          } catch { /* ignore */ }

          const config = getConfig();
          const requestUrl = request.url;
          const method = request.method;

          if (!config.enabled || !isAIEndpoint(requestUrl, config.aiEndpoints) || method === 'OPTIONS') {
            return; // Let the request pass through natively
          }

          const key = await generateStableKey(requestUrl, method, bodyText, config.cacheKeyStrategy);
          if (!key) return;

          // 0. Debounce
          if (config.debounceMs > 0) {
            await globalDebouncer.debounce(key, config.debounceMs);
          }

          // 1. Circuit Breaker
          if (globalBreaker.isOpen(key, config.breakerMaxFailures, config.breakerResetTimeoutMs)) {
            emitAudit(config, { type: 'breaker_opened', key, url: requestUrl, timestamp: Date.now() });
            controller.respondWith(Response.error());
            return;
          }

          // 2. Cache Check
          const activeCache = config.cacheAdapter || globalCache;
          const cached = await activeCache.get(key, config.cacheTtlMs);
          if (cached) {
            emitAudit(config, { type: 'cache_hit', key, url: requestUrl, timestamp: Date.now() });
            const buffer = base64ToBuffer(cached.responsePayloadBase64);
            controller.respondWith(buildResponse(buffer, { status: cached.status, headers: cached.headers }));
            return;
          }

          // 3. In-flight dedup
          const inFlightPromise = globalInFlightRegistry.get(key);
          if (inFlightPromise) {
            emitAudit(config, { type: 'in_flight_shared', key, url: requestUrl, timestamp: Date.now() });
            const sharedCached: SerializedCacheEntry = await inFlightPromise;
            const buffer = base64ToBuffer(sharedCached.responsePayloadBase64);
            controller.respondWith(buildResponse(buffer, { status: sharedCached.status, headers: sharedCached.headers }));
            return;
          }

          // Mark this key as in-flight for future dedup consumers
          let resolver: (value: SerializedCacheEntry) => void;
          let rejecter: (reason?: any) => void;
          const cacheDataPromise = new Promise<SerializedCacheEntry>((res, rej) => {
            resolver = res;
            rejecter = rej;
          });
          cacheDataPromise.catch(() => { });
          globalInFlightRegistry.set(key, cacheDataPromise);

          emitAudit(config, { type: 'live_called', key, url: requestUrl, timestamp: Date.now() });

          // Let the request proceed natively; we'll capture the response in the 'response' event
          // Store metadata for the response handler
          (request as any).__qg_key = key;
          (request as any).__qg_resolver = resolver!;
          (request as any).__qg_rejecter = rejecter!;
          (request as any).__qg_activeCache = activeCache;
        } catch (e) {
          // Fail-safe: let the request through natively
          return;
        }
      });

      batchInterceptor.on('response', async ({ response, request }: { response: Response, request: Request }) => {
        const key = (request as any).__qg_key;
        if (!key) return; // Not a guarded request

        const resolver = (request as any).__qg_resolver;
        const rejecter = (request as any).__qg_rejecter;
        const activeCache = (request as any).__qg_activeCache;
        const config = getConfig();
        const requestUrl = request.url;

        try {
          const clonedResponse = response.clone();
          const buffer = await clonedResponse.arrayBuffer();
          const headers: Record<string, string> = {};
          response.headers.forEach((val: string, k: string) => { headers[k] = val; });

          const cacheData: SerializedCacheEntry = {
            responsePayloadBase64: bufferToBase64(buffer),
            headers,
            status: response.status,
            timestamp: Date.now(),
            ttlMs: config.cacheTtlMs,
          };

          if (response.ok) {
            globalBreaker.recordSuccess(key);
            await activeCache.set(key, cacheData);
          } else {
            globalBreaker.recordFailure(key);
            emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { status: response.status } });
          }

          resolver(cacheData);
        } catch (err: any) {
          globalBreaker.recordFailure(key);
          emitAudit(config, { type: 'request_failed', key, url: requestUrl, timestamp: Date.now(), details: { error: err.message } });
          rejecter(err);
        } finally {
          globalInFlightRegistry.delete(key);
        }
      });

      batchInterceptor.apply();
      console.log('[Quota Guard] Network interceptor active (fetch + http/https).');
      return;
    } catch (e) {
      // @mswjs/interceptors not available, fall back to pure fetch
      console.warn('[Quota Guard] @mswjs/interceptors not available, falling back to fetch-only mode.');
    }
  }

  // Browser / fallback: legacy Proxy-based fetch hook
  if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    originalFetch = globalThis.fetch;
    const interceptor = createFetchInterceptor(originalFetch);
    globalThis.fetch = new Proxy(originalFetch, {
      apply: function (target, thisArg, argumentsList) {
        return interceptor.apply(thisArg, argumentsList as any);
      }
    });
  }
};

export const unhookFetch = () => {
  if (batchInterceptor) {
    batchInterceptor.dispose();
    batchInterceptor = null;
    return;
  }
  if (originalFetch && typeof globalThis !== 'undefined') {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
};
