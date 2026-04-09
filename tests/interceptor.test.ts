import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hookFetch, unhookFetch } from '../src/core/interceptor';
import { setConfig } from '../src/config';
import { globalCache } from '../src/cache/memory';
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
});
