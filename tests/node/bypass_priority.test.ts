import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchInterceptor } from '../../src/core/interceptor';
import { setConfig } from '../../src/config';
import { globalCache } from '../../src/cache/memory';

describe('Bypass Priority (Guard Safety Policy)', () => {
  let nativeFetchMock: ReturnType<typeof vi.fn>;
  let guardedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    globalCache.clear();
    nativeFetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ mock: 'live' }), { status: 200 });
    });
    
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 10000,
    });
    
    guardedFetch = createFetchInterceptor(nativeFetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should IGNORE business Cache-Control: no-cache and serve from cache', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'test' });

    // 1. First call to populate cache
    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    // 2. Second call with Cache-Control: no-cache
    const res = await guardedFetch(url, { 
      method: 'POST', 
      body, 
      headers: { 'Cache-Control': 'no-cache' } 
    });
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(1); // Still 1! Cache was used.
    expect(await res.json()).toEqual({ mock: 'live' });
  });

  it('should HONOR X-Quota-Guard-Bypass and skip cache', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'test' });

    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    // 2. Second call with X-Quota-Guard-Bypass
    await guardedFetch(url, { 
      method: 'POST', 
      body, 
      headers: { 'X-Quota-Guard-Bypass': 'true' } 
    });
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(2); // Skipped cache!
  });
});
