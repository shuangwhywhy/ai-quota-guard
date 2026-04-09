import { getConfig, setConfig, QuotaGuardConfig, AuditEvent } from '../config';
import { generateStableKey } from '../keys/normalizer';
import { globalCache, SerializedCacheEntry } from '../cache/memory';
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

const debounceRegistry = new Map<string, { timeoutId: any, rejecter: (reason: any) => void }>();

export const createFetchInterceptor = (nativeFetch: FetchFn): FetchFn => {
  return async function interceptor(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const config = getConfig();

    const { url: requestUrl, method, bodyText: reqBody } = await extractRequestData(input, init);

    if (!config.enabled || !isAIEndpoint(requestUrl, config.aiEndpoints) || method === 'OPTIONS') {
      return nativeFetch(input, init);
    }

    const key = await generateStableKey(requestUrl, method, reqBody);

    if (!key) {
      return nativeFetch(input, init);
    }

    // 0. Debounce Intercept
    if (config.debounceMs > 0) {
      const debounceKey = `${method}:${requestUrl}`;
      const existing = debounceRegistry.get(debounceKey);
      if (existing) {
        clearTimeout(existing.timeoutId);
        // Emulate a standard AbortError DOMException
        const abortErr = typeof DOMException !== 'undefined' 
          ? new DOMException('Request debounced by Quota Guard', 'AbortError')
          : new Error('Request debounced by Quota Guard');
        Object.defineProperty(abortErr, 'name', { value: 'AbortError' });
        existing.rejecter(abortErr);
        emitAudit(config, { type: 'debounced', key: debounceKey, url: requestUrl, timestamp: Date.now() });
      }

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          debounceRegistry.delete(debounceKey);
          resolve();
        }, config.debounceMs);
        debounceRegistry.set(debounceKey, { timeoutId, rejecter: reject });
      });
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

    // 3. In-flight (Debounce & Dedup) Check
    const inFlightPromise = globalInFlightRegistry.get(key);
    if (inFlightPromise) {
      emitAudit(config, { type: 'in_flight_shared', key, url: requestUrl, timestamp: Date.now() });
      // We must wait for the existing promise to resolve to ArrayBuffer, then build a response
      const sharedCached: SerializedCacheEntry = await inFlightPromise;
      const buffer = base64ToBuffer(sharedCached.responsePayloadBase64);
      return buildResponse(buffer, { status: sharedCached.status, headers: sharedCached.headers });
    }

    emitAudit(config, { type: 'live_called', key, url: requestUrl, timestamp: Date.now() });

    // 4. Execute Native Call
    let resolver: (value: SerializedCacheEntry) => void;
    let rejecter: (reason?: any) => void;
    // Store a Promise that predictably resolves to ArrayBuffer/cacheData
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
          timestamp: Date.now()
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
  };
};

export const hookFetch = () => {
  if (originalFetch) return; // already hooked
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
  if (originalFetch && typeof globalThis !== 'undefined') {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
};
