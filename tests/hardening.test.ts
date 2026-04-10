import { describe, it, expect, beforeEach, vi } from 'vitest';
// Directly import from the source files to ensure instance sharing in Vitest
import { createFetchInterceptor } from '../src/core/interceptor';
import { setConfig } from '../src/config';
import { globalBreaker } from '../src/breaker/circuit-breaker';
import { globalCache } from '../src/cache/memory';
import type { AuditEvent } from '../src/config';

describe('Hardening & Alignment Features', () => {
  let nativeFetchMock: ReturnType<typeof vi.fn>;
  let guardedFetch: typeof globalThis.fetch;
  let auditEvents: AuditEvent[] = [];

  beforeEach(async () => {
    globalBreaker.clear();
    await globalCache.clear();
    auditEvents = [];
    
    nativeFetchMock = vi.fn().mockImplementation(async () => {
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
      breakerMaxFailures: 3,
      globalBreakerMaxFailures: 10,
      debounceMs: 0,
      auditHandler: (e) => {
        auditEvents.push(e);
      }
    });

    guardedFetch = createFetchInterceptor(nativeFetchMock);
    vi.clearAllMocks();
  });

  it('should support X-Quota-Guard-Bypass header to skip cache', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'bypass test' });

    // 1. Warm cache
    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    await new Promise(r => setTimeout(r, 20));

    // 2. Normal call hits cache
    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    // 3. Bypass call skips cache
    await guardedFetch(url, { 
      method: 'POST', 
      body, 
      headers: { 'X-Quota-Guard-Bypass': 'true' } 
    });
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('should support RegExp objects in aiEndpoints configuration', async () => {
    setConfig({
      enabled: true,
      aiEndpoints: [/custom-ai-.*\.com/],
      debounceMs: 0,
      auditHandler: (e) => { auditEvents.push(e); }
    });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    const url = 'https://custom-ai-proxy.com/v1/chat';
    const body = JSON.stringify({ prompt: 'regexp test' });

    await guardedFetch(url, { method: 'POST', body });
    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    
    // Verify it was guarded by checking audit trail
    // console.log('Events:', auditEvents.map(e => e.type));
    expect(auditEvents.some(e => e.type === 'live_called' || e.type === 'request_started')).toBe(true);
  });

  it('should trigger Global Circuit Breaker after total failure threshold', async () => {
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      breakerMaxFailures: 100, // Per-key is high
      globalBreakerMaxFailures: 2, // Global is low
      debounceMs: 0,
      auditHandler: (e) => { auditEvents.push(e); }
    });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    nativeFetchMock.mockRejectedValue(new Error('Network Error'));

    // Request 1: Fail for Key A
    await guardedFetch('https://api.openai.com/a', { method: 'POST', body: 'a' }).catch(() => {});
    // Request 2: Fail for Key B
    await guardedFetch('https://api.openai.com/b', { method: 'POST', body: 'b' }).catch(() => {});

    // Request 3: Should be blocked by GLOBAL breaker even for Key C
    const res = await guardedFetch('https://api.openai.com/c', { method: 'POST', body: 'c' });
    
    expect(res.status).toBe(599);
    // If it's 599, it MUST have been blocked by a breaker.
    // Let's check if the global breaker state is correct
    expect((globalBreaker as unknown as { globalState: { failures: number } }).globalState.failures).toBe(2);
    
    expect(auditEvents.some(e => e.type === 'global_breaker_opened')).toBe(true);
    expect(nativeFetchMock).toHaveBeenCalledTimes(2);
  });

  it('should emit request_started and debounced events', async () => {
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      debounceMs: 50,
      auditHandler: (e) => { auditEvents.push(e); }
    });
    guardedFetch = createFetchInterceptor(nativeFetchMock);

    await guardedFetch('https://api.openai.com/chat', { method: 'POST', body: 'event test' });

    expect(auditEvents.some(e => e.type === 'request_started')).toBe(true);
    expect(auditEvents.some(e => e.type === 'debounced')).toBe(true);
  });
});
