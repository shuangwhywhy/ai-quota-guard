import { BatchInterceptor, HttpRequestEventMap, Interceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { getConfig, QuotaGuardConfig, AuditEvent } from '../config';
import { globalCache, SerializedCacheEntry } from '../cache/memory';
import { globalInFlightRegistry, globalInFlightRegistry as registry } from '../registry/in-flight';
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
  try {
    const m = '@mswjs/interceptors/ClientRequest';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ClientRequestInterceptor = require(m).ClientRequestInterceptor;
  } catch { /* ignore */ }
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

  if (ClientRequestInterceptor) {
    interceptors.push(new ClientRequestInterceptor());
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
      registry.set(key, broadcaster);

      (async () => {
        try {
          const buffer = await broadcaster.getFinalBuffer();
          const headers: Record<string, string> = {};
          response.headers.forEach((v: string, k: string) => { headers[k] = v; });

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
    
    try {
      const pipelineRequest = (input instanceof Request) ? input.clone() : new Request(input, init);
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
    }

    // 2. Real Network Call (MUST throw if it rejects)
    let response: Response;
    try {
      response = await nativeFetch(input, init);
    } catch (err) {
      if (key) {
        globalBreaker.recordFailure(key);
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
        registry.set(key, broadcaster);

        (async () => {
          const config = getConfig();
          const activeCache = config.cacheAdapter || globalCache;
          try {
            const buffer = await broadcaster.getFinalBuffer();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            response.headers.forEach((v: string, k: string) => { headers[k] = v; });

            const cacheData: SerializedCacheEntry = {
              responsePayloadBase64: bufferToBase64(buffer),
              headers,
              status: response.status,
              timestamp: Date.now(),
              ttlMs: config.cacheTtlMs,
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






