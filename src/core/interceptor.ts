import { BatchInterceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { getConfig, QuotaGuardConfig, AuditEvent } from '../config';
import { globalCache, SerializedCacheEntry } from '../cache/memory';
import { globalInFlightRegistry, globalInFlightRegistry as registry } from '../registry/in-flight';
import { globalBreaker } from '../breaker/circuit-breaker';
import { GuardPipeline } from './pipeline';
import { ResponseBroadcaster } from '../streams/broadcaster';

// Conditional import for Node-only interceptor to avoid browser bundling issues
let ClientRequestInterceptor: any = null;
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
if (isNode) {
  try {
    ClientRequestInterceptor = require('@mswjs/interceptors/ClientRequest').ClientRequestInterceptor;
  } catch { /* ignore */ }
}

let batchInterceptor: BatchInterceptor<any> | null = null;

const emitAudit = (event: AuditEvent) => {
  const config = getConfig();
  if (config.auditHandler) {
    try {
      config.auditHandler(event);
    } catch { /* ignore */ }
  }
};

const pipeline = new GuardPipeline(emitAudit);

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

/**
 * Global Network Hook: Unified for Node and Browsers.
 */
export const hookFetch = () => {
  if (batchInterceptor) return;

  const interceptors = [
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

  (batchInterceptor as any).on('request', async (params: any) => {
    const { request, controller } = params;
    
    try {
      const result = await pipeline.processRequest(request);

      if (result.error) {
        controller.respondWith(Response.error());
        return;
      }

      if (result.response) {
        // XHR Compatibility Fix: JSDOM XHR doesn't support ReadableStream payloads well.
        const isXhr = request.headers.get('x-requested-with') === 'XMLHttpRequest' || 
                      (typeof window !== 'undefined' && params.request && params.request.constructor.name === 'XMLHttpRequest');
        
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
        (request as any).__qg_key = result.key;
        (request as any).__qg_resolve = result.resolveBroadcaster;
      } else {
        emitAudit({ type: 'pass_through', key: 'none', url: request.url, timestamp: Date.now() });
      }
    } catch {
      emitAudit({ type: 'pass_through', key: 'error', url: request.url, timestamp: Date.now() });
    }

  });

  (batchInterceptor as any).on('response', async (params: any) => {
    const { response, request } = params;

    const key = (request as any).__qg_key;
    if (!key) return;

    const resolveBroadcaster = (request as any).__qg_resolve;
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

      if (result.error && result.error.name === 'CircuitBreakerError') {
        throw result.error;
      }

      if (result.response) {
        return result.response;
      }
      
      key = result.key;
      resolveBroadcaster = result.resolveBroadcaster;
      if (key) {
        emitAudit({ type: 'live_called', key, url: pipelineRequest.url, timestamp: Date.now() });
      }
    } catch (err: any) {
      if (err.name === 'CircuitBreakerError' || (err.message && err.message.includes('Circuit breaker'))) throw err;
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






