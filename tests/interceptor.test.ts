import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchInterceptor } from '../src/core/interceptor';
import { setConfig } from '../src/config';
import { globalCache, type ICacheAdapter, type SerializedCacheEntry } from '../src/cache/memory';
import { globalBreaker } from '../src/breaker/circuit-breaker';
import { globalInFlightRegistry } from '../src/registry/in-flight';

/**
 * These tests exercise the core Quota Guard pipeline (createFetchInterceptor)
 * directly, bypassing hookFetch() to avoid dependency on @mswjs/interceptors
 * which uses its own internal fetch routing. This keeps tests deterministic.
 */
describe('Quota Guard Fetch Interceptor', () => {
  let nativeFetchMock: any;
  let guardedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // Reset global state
    globalCache.clear();
    globalInFlightRegistry.clear?.();
    // Re-create mock for fetch
    nativeFetchMock = vi.fn().mockImplementation(async (url: any, init: any) => {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 10));
      return new Response(JSON.stringify({ mock: 'data' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 5000,
      breakerMaxFailures: 2,
      debounceMs: 0, // disable for most tests; specific tests override
    });

    // Create interceptor directly wrapping our mock
    guardedFetch = createFetchInterceptor(nativeFetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bypasses non-AI endpoints transparently', async () => {
    await guardedFetch('https://google.comApi');
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    await guardedFetch('https://google.comApi');
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates in-flight AI requests', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    const init = {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4', messages: [] })
    };

    // Fire 3 simultaneous requests
    const [res1, res2, res3] = await Promise.all([
      guardedFetch(url, init),
      guardedFetch(url, init),
      guardedFetch(url, init)
    ]);

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    const b1 = await res1.json();
    const b2 = await res2.json();
    
    expect(b1).toEqual(b2);
    expect(b1.mock).toBe('data');
  });

  it('caches identical subsequent requests', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    const init = {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hello caching!' })
    };

    await guardedFetch(url, init);
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    // Wait for in-flight to safely clear, now it's purely from cache
    await new Promise(r => setTimeout(r, 20));

    const cacheRes = await guardedFetch(url, init);
    expect(nativeFetchMock).toHaveBeenCalledTimes(1); // STILL 1!
    
    const body = await cacheRes.json();
    expect(body.mock).toBe('data');
  });

  it('triggers circuit breaker after failures', async () => {
    // Override mock to throw error
    nativeFetchMock.mockRejectedValue(new Error('Network offline'));

    const url = 'https://api.openai.com/v1/chat/completions';
    const init = { method: 'POST', body: 'loop fail' };

    // Failure 1
    await expect(guardedFetch(url, init)).rejects.toThrow('Network offline');
    // Failure 2 (Max allowed is 2 based on our config)
    await expect(guardedFetch(url, init)).rejects.toThrow('Network offline');

    // Failure 3 - Circuit Breaker should intercept before fetching!
    const res = await guardedFetch(url, init);
    expect(res.status).toBe(599);
    expect(res.headers.get('X-Quota-Guard-Reason')).toBe('breaker-open');
    expect(await res.text()).toContain('Circuit breaker open');
    
    // fetch was indeed only called 2 times
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('deep sorts JSON body keys strictly to ensure stable cache hits', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    await guardedFetch(url, {
      method: 'POST',
      body: JSON.stringify({ a: 1, c: { e: 5, d: 4 }, b: 2 })
    });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    await guardedFetch(url, {
      method: 'POST',
      // Same logical object, completely jumbled key order
      body: JSON.stringify({ b: 2, a: 1, c: { d: 4, e: 5 } })
    });
    
    // Should perfectly hit cache!
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('streams responses immediately while resolving inFlight buffers', async () => {
    // Mock a native stream response
    const customStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('chunk2'));
            controller.close();
        }, 30);
      }
    });
    
    nativeFetchMock.mockImplementationOnce(async () => {
      // Simulate network delay to allow duplicate fetch to hit inFlight checks properly
      await new Promise(r => setTimeout(r, 10));
      return new Response(customStream, { status: 200 });
    });

    const url = 'https://api.openai.com/v1/messages';
    
    // Fire twin parallel requests with a minimal delay to ensure `res1` becomes the master in async WebCrypto thread pools
    const p1 = guardedFetch(url, { method: 'POST', body: 'stream test' });
    await new Promise(r => setTimeout(r, 5));
    const p2 = guardedFetch(url, { method: 'POST', body: 'stream test' });
    
    const [res1, res2] = await Promise.all([p1, p2]);

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    // Request 1 got the live native stream!
    const reader1 = res1.body!.getReader();
    const c1 = await reader1.read();
    expect(new TextDecoder().decode(c1.value)).toBe('chunk1');
    const c2 = await reader1.read();
    expect(new TextDecoder().decode(c2.value)).toBe('chunk2');
    
    // Request 2 (the deduped one) securely received the final fully-assembled buffer from background cache task
    const text2 = await res2.text();
    expect(text2).toBe('chunk1chunk2');
  });

  it('safely extracts body from Request objects without eagerly consuming the underlying stream', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const requestObject = new Request(url, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'safely clone me' })
    });

    await guardedFetch(requestObject);
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    const mockCall = nativeFetchMock.mock.calls[0][0]; 
    
    // Crucially, the Request stream MUST remain intrinsically readable natively 
    // by the final native implementation!
    expect(mockCall.bodyUsed).toBe(false); 
  });

  it('encodes cached data to Base64 to seamlessly support external Storage Adapters (IoC)', async () => {
    const mockStorage: any = {};
    const customAdapter: ICacheAdapter = {
      get: async (key) => mockStorage[key] || null,
      set: async (key, data) => { mockStorage[key] = data; }
    };
    
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'], cacheAdapter: customAdapter, cacheTtlMs: 5000, breakerMaxFailures: 2, debounceMs: 0 });
    // Recreate interceptor with the new config
    guardedFetch = createFetchInterceptor(nativeFetchMock);
    
    const url = 'https://api.openai.com/v1/chat/completions';
    await guardedFetch(url, { method: 'POST', body: 'ioc-test' });
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    // Background stream reader needs time to consume stream2 and execute cacheAdapter.set()
    await new Promise(r => setTimeout(r, 20));
    
    const keys = Object.keys(mockStorage);
    expect(keys.length).toBe(1);
    
    const storedEntry: SerializedCacheEntry = mockStorage[keys[0]];
    
    // Confirm strict IoC text-serializability: payload MUST be a Base64 string, not an ArrayBuffer
    expect(typeof storedEntry.responsePayloadBase64).toBe('string');
    
    // Manually decode payload back to ArrayBuffer -> Text to verify it was safely intercepted
    const decodedBuf = Buffer.from(storedEntry.responsePayloadBase64, 'base64');
    expect(new TextDecoder().decode(decodedBuf)).toBe(JSON.stringify({ mock: 'data' }));
    
    // Re-call fetch identical payload to assure custom IoC adapter properly feeds hydration
    const cacheHit = await guardedFetch(url, { method: 'POST', body: 'ioc-test' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1); // STILL 1 call
    const cachedBody = await cacheHit.json();
    expect(cachedBody.mock).toBe('data');
  });

  it('bypasses perfectly safely when method is OPTIONS (CORS preflight)', async () => {
    const url = 'https://api.openai.com/v1/chat';
    await guardedFetch(url, { method: 'OPTIONS' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    // Call again, if it didn't bypass, it would hit cache and fetch times would be 1!
    await guardedFetch(url, { method: 'OPTIONS' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('records a circuit breaker failure and DOES NOT CACHE when response.ok is false (e.g. 400/429 errors)', async () => {
    // Return a 400 Bad Request
    nativeFetchMock.mockImplementationOnce(async () => {
      return new Response('bad request', { status: 400 });
    });
    
    const url = 'https://api.openai.com/v1/chat';
    await guardedFetch(url, { method: 'POST', body: 'error-test' });
    
    await new Promise(r => setTimeout(r, 20));
    
    // The background reader completed, but since it was 400, it SHOULD NOT BE CACHED.
    // So identical request will trigger the network again!
    await guardedFetch(url, { method: 'POST', body: 'error-test' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('gracefully simulates native arrayBuffer streaming if response.body (ReadableStream) goes missing', async () => {
    // Tests environments (like old node fetch or weird browsers) where Response has no readable body stream
    nativeFetchMock.mockImplementationOnce(async () => {
      const res = new Response('fallback');
      // Intentionally strip body stream feature to force the interceptor `else` block
      Object.defineProperty(res, 'body', { value: null });
      return res;
    });

    const res = await guardedFetch('https://api.openai.com/v1/chat', { method: 'POST', body: 'legacy-test' });
    const text = await res.text();
    expect(text).toBe('fallback');
  });

  it('debounces rapid identical AI requests, sharing the final Promise safely', async () => {
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'], debounceMs: 50, cacheTtlMs: 5000, breakerMaxFailures: 2, cacheKeyStrategy: 'exact' });
    guardedFetch = createFetchInterceptor(nativeFetchMock);
    const url = 'https://api.openai.com/v1/chat';

    const p1 = guardedFetch(url, { method: 'POST', body: 'same content' });
    const p2 = guardedFetch(url, { method: 'POST', body: 'same content' });
    const p3 = guardedFetch(url, { method: 'POST', body: 'same content' });

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // Only 1 actual fetch because all were grouped by debounce!
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    const capture = nativeFetchMock.mock.calls[0];
    const interceptedBody = capture[1].body;
    expect(interceptedBody).toBe('same content');
  });

  it('does NOT debounce different payload requests together', async () => {
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'], debounceMs: 50, cacheTtlMs: 5000, breakerMaxFailures: 2, cacheKeyStrategy: 'exact' });
    guardedFetch = createFetchInterceptor(nativeFetchMock);
    const url = 'https://api.openai.com/v1/chat';

    const p1 = guardedFetch(url, { method: 'POST', body: 'diff 1' });
    const p2 = guardedFetch(url, { method: 'POST', body: 'diff 2' });

    await Promise.all([p1, p2]);

    // Because the keys are different, they operate in parallel isolation
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('securely pipes all state transitions into the configured custom auditHandler', async () => {
    const customAuditLog = vi.fn();
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'], debounceMs: 0, auditHandler: customAuditLog });
    guardedFetch = createFetchInterceptor(nativeFetchMock);
    
    const url = 'https://api.openai.com/v1/chat';
    
    await guardedFetch(url, { method: 'POST', body: 'audit_test' });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body: 'audit_test' });

    expect(customAuditLog).toHaveBeenCalledTimes(2);

    expect(customAuditLog.mock.calls[0][0].type).toBe('live_called');
    expect(customAuditLog.mock.calls[0][0].url).toBe(url);

    expect(customAuditLog.mock.calls[1][0].type).toBe('cache_hit');
    expect(customAuditLog.mock.calls[1][0].url).toBe(url);
  });

  it('degrades gracefully to native fetch when interceptor internals throw', async () => {
    // Ensure fail-safe: if key generation explodes, request still goes through
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'], debounceMs: 0, cacheKeyStrategy: (() => { throw new Error('BOOM'); }) as any });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    const url = 'https://api.openai.com/v1/chat';
    const res = await guardedFetch(url, { method: 'POST', body: 'failsafe' });
    
    expect(res.status).toBe(200);
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes through when config.enabled is false', async () => {
    setConfig({ enabled: false, aiEndpoints: ['api.openai.com'], debounceMs: 0 });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    const url = 'https://api.openai.com/v1/chat';
    await guardedFetch(url, { method: 'POST', body: 'disabled' });
    await guardedFetch(url, { method: 'POST', body: 'disabled' });

    // Both calls come through directly without cache/dedup
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Quota Guard Multi-Provider Interception', () => {
  let nativeFetchMock: any;
  let guardedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    globalCache.clear();
    globalInFlightRegistry.clear?.();
    nativeFetchMock = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10));
      return new Response(JSON.stringify({ provider: 'response' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com', 'api.anthropic.com', 'api.deepseek.com', 'generativelanguage.googleapis.com', 'api.cohere.ai', 'api.mistral.ai'],
      cacheTtlMs: 5000,
      breakerMaxFailures: 3,
      debounceMs: 0,
    });

    guardedFetch = createFetchInterceptor(nativeFetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('intercepts and caches Anthropic requests', async () => {
    const url = 'https://api.anthropic.com/v1/messages';
    const body = JSON.stringify({ model: 'claude-3-opus', messages: [{ role: 'user', content: 'test' }] });

    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1); // Cache hit!
  });

  it('intercepts and caches DeepSeek requests', async () => {
    const url = 'https://api.deepseek.com/chat/completions';
    const body = JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] });

    await guardedFetch(url, { method: 'POST', body });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body });

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('intercepts and caches Google Gemini requests', async () => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
    const body = JSON.stringify({ contents: [{ parts: [{ text: 'hello' }] }] });

    await guardedFetch(url, { method: 'POST', body });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body });

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('intercepts and caches Cohere requests', async () => {
    const url = 'https://api.cohere.ai/v1/chat';
    const body = JSON.stringify({ message: 'hello from cohere', model: 'command-r-plus' });

    await guardedFetch(url, { method: 'POST', body });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body });

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('intercepts and caches Mistral requests', async () => {
    const url = 'https://api.mistral.ai/v1/chat/completions';
    const body = JSON.stringify({ model: 'mistral-large-latest', messages: [{ role: 'user', content: 'test' }] });

    await guardedFetch(url, { method: 'POST', body });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body });

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('intercepts custom user-defined endpoints', async () => {
    setConfig({
      enabled: true,
      aiEndpoints: ['api.my-custom-llm.com'],
      cacheTtlMs: 5000,
      breakerMaxFailures: 3,
      debounceMs: 0,
    });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    const url = 'https://api.my-custom-llm.com/v1/generate';
    const body = JSON.stringify({ prompt: 'custom test' });

    await guardedFetch(url, { method: 'POST', body });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body });

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates in-flight across different AI providers independently', async () => {
    const openaiUrl = 'https://api.openai.com/v1/chat';
    const anthropicUrl = 'https://api.anthropic.com/v1/messages';
    const body = JSON.stringify({ model: 'test', messages: [] });

    // Two different providers at the same time — both should go through
    const [res1, res2] = await Promise.all([
      guardedFetch(openaiUrl, { method: 'POST', body }),
      guardedFetch(anthropicUrl, { method: 'POST', body }),
    ]);

    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('handles malformed URL gracefully via fail-safe', async () => {
    // isAIEndpoint catches URL parse errors
    const res = await guardedFetch('not-a-valid-url', { method: 'POST', body: 'test' });
    expect(res.status).toBe(200);
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('intelligently caches across providers when body semantics match', async () => {
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 5000,
      breakerMaxFailures: 3,
      debounceMs: 0,
      cacheKeyStrategy: 'intelligent',
    });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    const url = 'https://api.openai.com/v1/chat';
    const body1 = JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'test' }], temperature: 0.5 });
    const body2 = JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'test' }], temperature: 0.9, stream: true });

    await guardedFetch(url, { method: 'POST', body: body1 });
    await new Promise(r => setTimeout(r, 20));
    await guardedFetch(url, { method: 'POST', body: body2 });

    // Intelligent strategy ignores temperature and stream → cache hit!
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
  });
});
