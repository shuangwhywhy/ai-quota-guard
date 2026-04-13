import { BatchInterceptor, HttpRequestEventMap, Interceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { getConfig, type AuditEvent } from '../config.js';
import { globalCache } from '../cache/memory.js';
import type { SerializedCacheEntry } from '../cache/types.js';
import { globalInFlightRegistry as registry } from '../registry/in-flight.js';
import { globalBreaker, CircuitBreakerError } from '../breaker/circuit-breaker.js';
import { GuardPipeline } from './pipeline.js';
import { ResponseBroadcaster } from '../streams/broadcaster.js';
import { bufferToBase64 } from '../utils/encoding.js';

import { getMetadata, setMetadata } from './metadata.js';
import { globalStats } from '../utils/stats-collector.js';
import { logIntercept } from '../utils/logger.js';
import { computeUsage } from '../providers/token-parser.js';

// Conditional import for Node-only interceptor to avoid browser bundling issues
type ClientRequestInterceptorType = new () => Interceptor<HttpRequestEventMap>;
let ClientRequestInterceptor: ClientRequestInterceptorType | null = null;
const isNode = typeof process !== 'undefined' && process.versions && (process.versions as Record<string, string>).node;

let batchInterceptor: BatchInterceptor<Interceptor<HttpRequestEventMap>[]> | null = null;

const emitAudit = (event: AuditEvent) => {
  const config = getConfig();
  if (config.auditHandler) {
    try {
      config.auditHandler(event);
    } catch { /* ignore */ }
  }
};

let pipeline = new GuardPipeline(emitAudit);

/**
 * INTERNAL USE ONLY: Reset or inject a mock pipeline for testing.
 */
export const __injectTestPipeline = (p: GuardPipeline) => {
  pipeline = p;
};

/**
 * Global Network Interceptor: Passively catch and manage all traffic (Fetch & XHR).
 * This provides a solid custody over requests without library-specific preferences.
 */
export const applyGlobalGuards = async () => {
  if (batchInterceptor) return;

  // 1. Load Node-only interceptor if in Node environment
  if (isNode && !ClientRequestInterceptor) {
    try {
      // Use await import() to support both ESM and CJS safely.
      // This bypasses the "Dynamic require is not supported" error in ESM bundles.
      const mod = await import('@mswjs/interceptors/ClientRequest');
      if (mod && mod.ClientRequestInterceptor) {
        ClientRequestInterceptor = mod.ClientRequestInterceptor;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Quota Guard] Failed to load Node.js ClientRequestInterceptor:', e);
    }
  }

  const interceptors: Interceptor<HttpRequestEventMap>[] = [
    new FetchInterceptor(),
    new XMLHttpRequestInterceptor(),
  ];

  // 2. Inject Node Interceptor if available
  if (isNode) {
    if (ClientRequestInterceptor) {
      interceptors.push(new ClientRequestInterceptor());
    } else {
        // eslint-disable-next-line no-console
        console.warn('[Quota Guard] Node.js bridge unavailable. Native http/https requests might be unguarded.');
    }
  }

  batchInterceptor = new BatchInterceptor({
    name: 'quota-guard',
    interceptors,
  });

  batchInterceptor.on('request', async ({ request, controller }) => {
    // Handle Aborted Requests
    request.signal.addEventListener('abort', () => {
      const meta = getMetadata(request);
      const k = meta.key || 'unknown';
      emitAudit({ type: 'request_aborted', key: k, url: request.url, timestamp: Date.now() });
      if (meta.key) {
        registry.delete(meta.key);
      }
    });

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
        
        if (result.key) {
           globalStats.record({
             type: 'BREAKER',
             key: result.key,
             url: request.url,
             hostname: new URL(request.url).hostname
           });
           if (getConfig().consoleLog) logIntercept('BREAKER', result.key, request.url);
        }
        return;
      }

      if (result.response) {
        // HIT or SHARED from cache/in-flight
        if (result.key) {
          const status = result.status || 'HIT';
          
          // For cached hits, we can estimate tokens from the response immediately
          (async () => {
             try {
                const clonedRes = result.response!.clone();
                const isJson = clonedRes.headers.get('content-type')?.includes('application/json');
                const resBody = isJson ? await clonedRes.json().catch(() => clonedRes.text()) : await clonedRes.text();
                const reqBody = await request.clone().text().catch(() => null);
                const usage = computeUsage(reqBody, resBody);
                
                globalStats.record({
                  type: status,
                  key: result.key!,
                  url: request.url,
                  hostname: new URL(request.url).hostname,
                  usage
                });
                if (getConfig().consoleLog) logIntercept(status, result.key!, request.url, `${usage.totalTokens} tokens ${usage.isEstimated ? '(est.)' : ''}`);
             } catch {
                // Silently ignore parsing errors for logging
             }
          })();
        }

        // XHR Transport Compatibility:
        // Some environments (like JSDOM or older browsers) cannot handle a ReadableStream body 
        // being piped into a simulated XMLHttpRequest. To be 'solid', we buffer the response 
        // to ensure it reaches the business system regardless of their choice of transport.
        const isXhr = request.headers.get('x-requested-with') === 'XMLHttpRequest' || 
                      (typeof XMLHttpRequest !== 'undefined' && request instanceof Request && !('referrerPolicy' in request) && (typeof window !== 'undefined'));
        
        if (isXhr && result.response.body && !result.response.bodyUsed) {
           const buffer = await result.response.clone().arrayBuffer();
           controller.respondWith(new Response(buffer, { 
             status: result.response.status, 
             headers: result.response.headers 
           }));
        } else {
           // For Fetch or compatible transports, we provide the native Stream API (ReadableStream).
           controller.respondWith(result.response);
        }
        return;
      }

      if (result.key) {
        // AI Endpoint Detected & Guarded
        emitAudit({ type: 'live_called', key: result.key, url: request.url, timestamp: Date.now() });
        setMetadata(request, { 
          key: result.key, 
          resolveBroadcaster: result.resolveBroadcaster,
          requestBody: await request.clone().text() // Capture for token counting later
        });

        // Loop Prevention: We use a custom header to bypass our own interceptor for this internal redirection.
        try {
          // IMPORTANT: We must respondWith so msw stops processing the original ClientRequest/XHR.
          const internalHeaders = new Headers(request.headers);
          internalHeaders.set('x-quota-guard-internal', 'true');
          
          const response = await fetch(request.url, {
            method: request.method,
            headers: internalHeaders,
            body: request.body,
            // @ts-expect-error - duplex is required for streaming bodies in some environments
            duplex: 'half'
          });
          controller.respondWith(response);
        } catch (err) {
          emitAudit({ type: 'request_failed', key: result.key, url: request.url, timestamp: Date.now(), details: { error: String(err) } });
          controller.respondWith(Response.error());
        }
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
            
            // Record LIVE stats
            const reqBody = (meta as RequestMetadata).requestBody;
            let resBody: unknown;
            try {
              const decoded = new TextDecoder().decode(buffer);
              resBody = JSON.parse(decoded);
            } catch {
              resBody = new TextDecoder().decode(buffer);
            }
            const usage = computeUsage(reqBody || null, resBody);
            
            globalStats.record({
              type: 'LIVE',
              key,
              url: request.url,
              hostname: new URL(request.url).hostname,
              usage
            });
            if (getConfig().consoleLog) logIntercept('LIVE', key, request.url, `${usage.totalTokens} tokens ${usage.isEstimated ? '(est.)' : ''}`);
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
};

export const removeGlobalGuards = () => {
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
    } catch {
      // If malformed URL or Request init fails, bypass guard and call native directly
      return nativeFetch(input, init);
    }

    try {
      const result = await pipeline.processRequest(pipelineRequest);

      if (result.error && result.error instanceof CircuitBreakerError) {
        return new Response('Quota Guard: Circuit breaker open.', {
          status: 599,
          statusText: 'Quota Guard: Circuit Breaker Open',
          headers: { 'X-Quota-Guard-Reason': 'breaker-open' }
        });
      }

      if (result.response) {
        if (result.key) {
           const status = result.status || 'HIT';
           (async () => {
             try {
               const clonedRes = (result.response as Response).clone();
               const isJson = clonedRes.headers.get('content-type')?.includes('application/json');
               const resBody = isJson ? await clonedRes.json().catch(() => clonedRes.text()) : await clonedRes.text();
               const reqBody = await pipelineRequest.text().catch(() => null);
               const usage = computeUsage(reqBody, resBody);
               
               globalStats.record({
                 type: status,
                 key: result.key!,
                 url: pipelineRequest.url,
                 hostname: new URL(pipelineRequest.url).hostname,
                 usage
               });
               if (getConfig().consoleLog) logIntercept(status, result.key!, pipelineRequest.url, `${usage.totalTokens} tokens ${usage.isEstimated ? '(est.)' : ''}`);
             } catch {
               // Silently ignore
             }
           })();
        }
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
    } catch (err: unknown) {
      if (key) {
        const errorObject = err as { name?: string; message?: string } | null;
        const errorName = errorObject?.name || (err instanceof Error ? err.name : 'Unknown');
        if (errorName === 'AbortError' || errorName === 'CanceledError' || (errorObject?.message && String(errorObject.message).includes('aborted'))) {
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
              
              // Record LIVE stats
              const reqBody = await pipelineRequest.clone().text().catch(() => null);
              let resBody: unknown;
              try {
                const decoded = new TextDecoder().decode(buffer);
                resBody = JSON.parse(decoded);
              } catch {
                resBody = new TextDecoder().decode(buffer);
              }
              const usage = computeUsage(reqBody || null, resBody);
              
              globalStats.record({
                type: 'LIVE',
                key: key!,
                url: pipelineRequest.url,
                hostname: new URL(pipelineRequest.url).hostname,
                usage
              });
              if (getConfig().consoleLog) logIntercept('LIVE', key!, pipelineRequest.url, `${usage.totalTokens} tokens ${usage.isEstimated ? '(est.)' : ''}`);
            } else {
              globalBreaker.recordFailure(key!);
            }
          } catch {
            if (key) globalBreaker.recordFailure(key);
          } finally {
            if (key) registry.delete(key);
          }
        })();

        return broadcaster.subscribe({ 'X-Quota-Guard': 'LIVE' });
      } catch {
        if (key) registry.delete(key);
        return response;
      }
    }
    
    return response;
  };
};






