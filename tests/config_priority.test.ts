import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchInterceptor } from '../src/core/interceptor';
import { setConfig } from '../src/config';
import { globalCache } from '../src/cache/memory';

describe('Bypass Priority: Config vs Business', () => {
  let nativeFetchMock: ReturnType<typeof vi.fn>;
  let guardedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    globalCache.clear();
    nativeFetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ mock: 'live' }), { status: 200 });
    });
    
    // Core Config: 10s TTL, ignore Cache-Control
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

  it('[Guard Priority] ignores business Cache-Control but serves from cache', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'test' });

    // 1. Populate cache
    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    // 2. Business tries to bypass (Should fail and hit cache)
    const res = await guardedFetch(url, { 
      method: 'POST', 
      body, 
      headers: { 'Cache-Control': 'no-cache' } 
    });
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(1); // STILL 1 call
    const data = await res.json();
    expect(data.mock).toBe('live');
  });

  it('[Config Priority] honors rule-based bypass even if business header is absent', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'config test' });

    // 1. Populate cache
    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    // 2. Admin adds a rule to bypass this specific call in config
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 10000,
      rules: [
        {
          match: { url: /chat/ },
          override: { cacheTtlMs: 0 } // This is how config-based bypass works
        }
      ]
    });
    
    // 3. Call again without any bypass headers
    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(2); // BYPASSED CACHE due to config rule!
  });

  it('[Explicit Priority] honors X-Quota-Guard-Bypass header', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'explicit test' });

    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    await new Promise(r => setTimeout(r, 20));

    // Business uses the internal "emergency" bypass header
    await guardedFetch(url, { 
      method: 'POST', 
      body, 
      headers: { 'X-Quota-Guard-Bypass': 'true' } 
    });
    
    expect(nativeFetchMock).toHaveBeenCalledTimes(2); // Successful Bypass
  });
});
