import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hookFetch, unhookFetch } from '../src/core/interceptor';
import { setConfig } from '../src/config';
import { globalCache, type ICacheAdapter, type SerializedCacheEntry } from '../src/cache/memory';
import { globalBreaker } from '../src/breaker/circuit-breaker';
import { globalInFlightRegistry } from '../src/registry/in-flight';

describe('Quota Guard Fetch Interceptor', () => {
  let nativeFetchMock: any;

  beforeEach(() => {
    // Reset global state
    globalCache.clear();
    // Re-create mock for fetch
    nativeFetchMock = vi.fn().mockImplementation(async (url, init) => {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 10));
      return new Response(JSON.stringify({ mock: 'data' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    
    nativeFetchMock.__next_internal_cache = 'force-cache';
    globalThis.fetch = nativeFetchMock;
    
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 5000,
      breakerMaxFailures: 2,
    });
    hookFetch();
  });

  afterEach(() => {
    unhookFetch();
  });

  it('bypasses non-AI endpoints transparently', async () => {
    await fetch('https://google.comApi');
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    const secondCall = await fetch('https://google.comApi');
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
      fetch(url, init),
      fetch(url, init),
      fetch(url, init)
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

    await fetch(url, init);
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    // Wait for in-flight to safely clear, now it's purely from cache
    await new Promise(r => setTimeout(r, 20));

    const cacheRes = await fetch(url, init);
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
    await expect(fetch(url, init)).rejects.toThrow('Network offline');
    // Failure 2 (Max allowed is 2 based on our config)
    await expect(fetch(url, init)).rejects.toThrow('Network offline');

    // Failure 3 - Circuit Breaker should intercept before fetching!
    await expect(fetch(url, init)).rejects.toThrow('Circuit breaker OPEN');
    
    // fetch was indeed only called 2 times
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('deep sorts JSON body keys strictly to ensure stable cache hits', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ a: 1, c: { e: 5, d: 4 }, b: 2 })
    });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    await fetch(url, {
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
    const p1 = fetch(url, { method: 'POST', body: 'stream test' });
    await new Promise(r => setTimeout(r, 5));
    const p2 = fetch(url, { method: 'POST', body: 'stream test' });
    
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

    await fetch(requestObject);
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    const mockCall = nativeFetchMock.mock.calls[0][0]; 
    
    // Crucially, the Request stream MUST remain intrinsically readable natively 
    // by the final native implementation!
    expect(mockCall.bodyUsed).toBe(false); 
  });

  it('preserves framework static properties via ES6 Proxy (e.g. Next.js Transparency)', () => {
    // Tests that internal frameworks properties survive intersection wrapping
    expect((fetch as any).__next_internal_cache).toBe('force-cache');
    // Ensure standard Function.name resolves correctly as a secondary proxy check. (vi.fn() creates a function named 'spy')
    expect(fetch.name).toBe('spy');
  });

  it('encodes cached data to Base64 to seamlessly support external Storage Adapters (IoC)', async () => {
    const mockStorage: any = {};
    const customAdapter: ICacheAdapter = {
      get: async (key) => mockStorage[key] || null,
      set: async (key, data) => { mockStorage[key] = data; }
    };
    
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'], cacheAdapter: customAdapter, cacheTtlMs: 5000, breakerMaxFailures: 2 });
    
    const url = 'https://api.openai.com/v1/chat/completions';
    await fetch(url, { method: 'POST', body: 'ioc-test' });
    
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
    const cacheHit = await fetch(url, { method: 'POST', body: 'ioc-test' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1); // STILL 1 call
    const cachedBody = await cacheHit.json();
    expect(cachedBody.mock).toBe('data');
  });

  it('bypasses perfectly safely when method is OPTIONS (CORS preflight)', async () => {
    const url = 'https://api.openai.com/v1/chat';
    await fetch(url, { method: 'OPTIONS' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    // Call again, if it didn't bypass, it would hit cache and fetch times would be 1!
    await fetch(url, { method: 'OPTIONS' });
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('records a circuit breaker failure and DOES NOT CACHE when response.ok is false (e.g. 400/429 errors)', async () => {
    // Return a 400 Bad Request
    nativeFetchMock.mockImplementationOnce(async () => {
      return new Response('bad request', { status: 400 });
    });
    
    const url = 'https://api.openai.com/v1/chat';
    await fetch(url, { method: 'POST', body: 'error-test' });
    
    await new Promise(r => setTimeout(r, 20));
    
    // The background reader completed, but since it was 400, it SHOULD NOT BE CACHED.
    // So identical request will trigger the network again!
    await fetch(url, { method: 'POST', body: 'error-test' });
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

    const res = await fetch('https://api.openai.com/v1/chat', { method: 'POST', body: 'legacy-test' });
    const text = await res.text();
    expect(text).toBe('fallback');
  });
});


