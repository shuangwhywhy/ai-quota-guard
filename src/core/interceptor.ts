import { BatchInterceptor, HttpRequestEventMap, Interceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { getConfig, type AuditEvent } from '../config';
import { globalCache, type SerializedCacheEntry } from '../cache/memory';
import { globalInFlightRegistry as registry } from '../registry/in-flight';
import { globalBreaker, CircuitBreakerError } from '../breaker/circuit-breaker';
import { GuardPipeline } from './pipeline';
import { ResponseBroadcaster } from '../streams/broadcaster';
import { bufferToBase64 } from '../utils/encoding';

import { getMetadata, setMetadata } from './metadata';

// Conditional import for Node-only interceptor to avoid browser bundling issues
type ClientRequestInterceptorType = new () => Interceptor<HttpRequestEventMap>;
let ClientRequestInterceptor: ClientRequestInterceptorType | null = null;
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
if (isNode) {
  const m = '@mswjs/interceptors/ClientRequest';
  import(m).then((mod) => {
    ClientRequestInterceptor = mod.ClientRequestInterceptor;
  }).catch(() => { /* ignore */ });
}

let batchInterceptor: BatchInterceptor<Interceptor<HttpRequestEventMap>[]> | null = null;

const emitAudit = (event: AuditEvent) => {
  const config = getConfig();
  if (config.auditHandler) {
    try {
      config.auditHandler(event);
    } catch { /* ignore */ }
  }
};

const pipeline = new GuardPipeline(emitAudit);

// Removed local bufferToBase64, now imported from utils

/**
 * Global Network Hook: Unified for Node and Browsers.
 */
export const hookFetch = () => {
  if (batchInterceptor) return;

  const interceptors: Interceptor<HttpRequestEventMap>[] = [
    new FetchInterceptor(),
    new XMLHttpRequestInterceptor(),
  ];

  // Robust Synchronous Node Injection
  if (isNode) {
    try {
      // In Node.js environments (CJS or ESM), we try to get the ClientRequestInterceptor synchronously.
      // We use a dynamic import/require dance that bypasses browser bundlers.
      const CRI_PATH = '@mswjs/interceptors/ClientRequest';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(CRI_PATH);
      if (mod && mod.ClientRequestInterceptor) {
        interceptors.push(new mod.ClientRequestInterceptor());
      }
    } catch {
      // If require fails (e.g. in pure ESM without compatible loader), we fallback to the already-started async load
      if (ClientRequestInterceptor) {
        interceptors.push(new ClientRequestInterceptor());
      } else {
        // eslint-disable-next-line no-console
        console.warn('[Quota Guard] Node.js bridge loading asynchronously. Initial requests might be unguarded.');
      }
    }
  }

  batchInterceptor = new BatchInterceptor({
    name: 'quota-guard',
    interceptors,
  });

  batchInterceptor.on('request', async ({ request, controller }) => {
    try {
      const result = await pipeline.processRequest(request);

      if (result.error) {
        if (result.error instanceof CircuitBreakerError) {
          controller.respondWith(new Response('Quota Guard: Circuit breaker open.', {
            status: 599,
            statusText: 'Quota Guard: Circuit Breaker Open',
            headers: { 'X-Quota-Guard-Reason': 'breaker-open' }
          }));
        } else {
          controller.respondWith(Response.error());
        }
        return;
      }

      if (result.response) {
        // XHR Compatibility Fix: JSDOM XHR and some environments don't support ReadableStream payloads well.
        // We detect XHR by checking 'X-Requested-With' or using a more robust environment check.
        const isXhr = request.headers.get('x-requested-with') === 'XMLHttpRequest' || 
                      (typeof XMLHttpRequest !== 'undefined' && request instanceof Request && !('referrerPolicy' in request) && (typeof window !== 'undefined'));
        
        // Fail-safe: If we are in a browser-like env (JSDOM) and it's a stream, convert to ArrayBuffer if body is a stream
        if (isXhr && result.response.body && !result.response.bodyUsed) {
           const buffer = await result.response.clone().arrayBuffer();
           controller.respondWith(new Response(buffer, { 
             status: result.response.status, 
             headers: result.response.headers 
           }));
        } else {
           controller.respondWith(result.response);
        }
        return;
      }

      if (result.key) {
        emitAudit({ type: 'live_called', key: result.key, url: request.url, timestamp: Date.now() });
        setMetadata(request, { 
          key: result.key, 
          resolveBroadcaster: result.resolveBroadcaster 
        });
      } else {
        emitAudit({ type: 'pass_through', key: 'none', url: request.url, timestamp: Date.now() });
      }
    } catch {
      emitAudit({ type: 'pass_through', key: 'error', url: request.url, timestamp: Date.now() });
    }

  });

  // Handle Aborted Requests
  batchInterceptor.on('request:aborted', ({ request }) => {
    const meta = getMetadata(request);
    const key = meta.key || 'unknown';
    emitAudit({ type: 'request_aborted', key, url: request.url, timestamp: Date.now() });
    if (meta.key) {
      registry.delete(meta.key);
    }
  });

  batchInterceptor.on('response', async ({ response, request }) => {
    const meta = getMetadata(request);
    const key = meta.key;
    if (!key) return;

    const resolveBroadcaster = meta.resolveBroadcaster;
    const config = getConfig();
    const activeCache = config.cacheAdapter || globalCache;

    try {
      const broadcaster = new ResponseBroadcaster(response.clone());
      if (resolveBroadcaster) {
        resolveBroadcaster(broadcaster);
      }
      // Note: We don't registry.set here anymore as pipeline.processRequest already set the promise
      // But we should replace the promise with the actual broadcaster for slightly faster future hits
      const headersMap: Record<string, string> = {};
      request.headers.forEach((v, k) => { headersMap[k.toLowerCase()] = v; });
      const snapshot = { url: request.url, method: request.method, headers: headersMap };
      
      registry.set(key, broadcaster, snapshot);

      (async () => {
        try {
          const buffer = await broadcaster.getFinalBuffer();
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((v: string, k: string) => { responseHeaders[k] = v; });

          const cacheData: SerializedCacheEntry = {
            responsePayloadBase64: bufferToBase64(buffer),
            headers: responseHeaders,
            status: response.status,
            timestamp: Date.now(),
            ttlMs: config.cacheTtlMs,
            requestSnapshot: snapshot
          };

          if (response.ok) {
            globalBreaker.recordSuccess(key);
            await activeCache.set(key, cacheData);
          } else {
            globalBreaker.recordFailure(key);
            emitAudit({ type: 'request_failed', key, url: request.url, timestamp: Date.now(), details: { status: response.status } });
          }
        } catch {
          globalBreaker.recordFailure(key);
        } finally {
          registry.delete(key);
        }
      })();
    } catch {
      registry.delete(key);
    }
  });

  batchInterceptor.apply();
  // eslint-disable-next-line no-console
  console.log('[Quota Guard] Unified network guard active.');
};

export const unhookFetch = () => {
  if (batchInterceptor) {
    batchInterceptor.dispose();
    batchInterceptor = null;
  }
};

/**
 * Manual Fetch Interceptor: Wraps a native fetch function with Quota Guard logic.
 */
export const createFetchInterceptor = (nativeFetch: typeof globalThis.fetch) => {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let key: string | undefined;
    let resolveBroadcaster: ((b: ResponseBroadcaster) => void) | undefined;
    let pipelineRequest: Request;
    try {
      pipelineRequest = (input instanceof Request) ? input.clone() : new Request(input, init);
      const result = await pipeline.processRequest(pipelineRequest);

      if (result.error && result.error instanceof CircuitBreakerError) {
        return new Response('Quota Guard: Circuit breaker open.', {
          status: 599,
          statusText: 'Quota Guard: Circuit Breaker Open',
          headers: { 'X-Quota-Guard-Reason': 'breaker-open' }
        });
      }

      if (result.response) {
        return result.response;
      }
      
      key = result.key;
      resolveBroadcaster = result.resolveBroadcaster;
      if (key) {
        emitAudit({ type: 'live_called', key, url: pipelineRequest.url, timestamp: Date.now() });
      }
    } catch (err) {
      if (err instanceof Error && (err.name === 'CircuitBreakerError' || err.message.includes('Circuit breaker'))) throw err;
      // Fail-safe: ensure pipelineRequest is at least a valid Request if something went wrong before it was assigned
      if (!(pipelineRequest! instanceof Request)) {
        pipelineRequest = (input instanceof Request) ? input.clone() : new Request(input, init);
      }
    }

    // 2. Real Network Call (MUST throw if it rejects)
    let response: Response;
    try {
      response = await nativeFetch(input, init);
    } catch (err: any) {
      if (key) {
        const errorName = err?.name || (err instanceof Error ? err.name : 'Unknown');
        if (errorName === 'AbortError' || errorName === 'CanceledError' || (err?.message && err.message.includes('aborted'))) {
          emitAudit({ type: 'request_aborted', key, url: pipelineRequest.url, timestamp: Date.now() });
        } else {
          globalBreaker.recordFailure(key);
        }
        registry.delete(key);
      }
      throw err; // Proper propagation of native errors
    }

    // 3. Post-fetch Recording (Protected)
    if (key) {
      try {
        const broadcaster = new ResponseBroadcaster(
          typeof response.clone === 'function' ? response.clone() : response
        );
        if (resolveBroadcaster) resolveBroadcaster(broadcaster);
        
        const headersMap: Record<string, string> = {};
        const inputUrl = (input instanceof Request) ? input.url : input.toString();
        const inputMethod = (input instanceof Request) ? input.method : (init?.method || 'GET');
        
        if (input instanceof Request) {
          input.headers.forEach((v, k) => { headersMap[k.toLowerCase()] = v; });
        } else if (init?.headers) {
          const h = new Headers(init.headers);
          h.forEach((v, k) => { headersMap[k.toLowerCase()] = v; });
        }
        const snapshot = { url: inputUrl, method: inputMethod, headers: headersMap };

        registry.set(key, broadcaster, snapshot);

        (async () => {
          const config = getConfig();
          const activeCache = config.cacheAdapter || globalCache;
          try {
            const buffer = await broadcaster.getFinalBuffer();
            const responseHeaders: Record<string, string> = { 'Content-Type': response.headers.get('Content-Type') || 'application/json' };
            response.headers.forEach((v: string, k: string) => { responseHeaders[k] = v; });

            const cacheData: SerializedCacheEntry = {
              responsePayloadBase64: bufferToBase64(buffer),
              headers: responseHeaders,
              status: response.status,
              timestamp: Date.now(),
              ttlMs: config.cacheTtlMs,
              requestSnapshot: snapshot
            };

            if (response.ok) {
              globalBreaker.recordSuccess(key!);
              await activeCache.set(key!, cacheData);
            } else {
              globalBreaker.recordFailure(key!);
            }
          } catch {
            if (key) globalBreaker.recordFailure(key);
          } finally {
            if (key) registry.delete(key);
          }
        })();

        return broadcaster.subscribe();
      } catch {
        if (key) registry.delete(key);
        return response;
      }
    }
    
    return response;
  };
};






