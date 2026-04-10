import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchInterceptor } from '../../src/core/interceptor';
import { setConfig } from '../../src/config';
import { globalCache } from '../../src/cache/memory';

describe('Audit Event Coverage (Unit)', () => {
  let auditHandler: ReturnType<typeof vi.fn>;
  let nativeFetchMock: ReturnType<typeof vi.fn>;
  let guardedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    globalCache.clear();
    auditHandler = vi.fn();
    nativeFetchMock = vi.fn().mockImplementation(async () => {
      return new Response('ok');
    });
    
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      auditHandler,
      debounceMs: 0,
    });
    
    guardedFetch = createFetchInterceptor(nativeFetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should emit request_started and live_called events', async () => {
    const url = 'https://api.openai.com/v1/chat';
    await guardedFetch(url, { method: 'POST', body: JSON.stringify({ prompt: 'test' }) });
    
    const events = auditHandler.mock.calls.map(c => c[0].type);
    expect(events).toContain('request_started');
    expect(events).toContain('live_called');
  });

  it('should emit request_aborted when request is cancelled', async () => {
    const url = 'https://api.openai.com/v1/chat';
    
    // Throw a REAL Error object with name AbortError
    nativeFetchMock.mockImplementationOnce(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    try {
      await guardedFetch(url, { 
        method: 'POST', 
        body: JSON.stringify({ prompt: 'abort test' }),
      });
    } catch (err: unknown) {
      // confirm it propagated
      expect((err as Error).name).toBe('AbortError');
    }

    const events = auditHandler.mock.calls.map(c => c[0].type);
    expect(events).toContain('request_aborted');
  });

  it('should emit cache_hit event', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = JSON.stringify({ prompt: 'cache event test' });
    
    await guardedFetch(url, { method: 'POST', body });
    // Wait for the background task in broadcaster
    await new Promise(r => setTimeout(r, 150)); 
    
    auditHandler.mockClear();
    await guardedFetch(url, { method: 'POST', body });

    const events = auditHandler.mock.calls.map(c => c[0].type);
    expect(events).toContain('cache_hit');
  });
});
