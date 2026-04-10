import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFetchInterceptor } from '../src/core/interceptor';
import { globalInFlightRegistry } from '../src/registry/in-flight';
import { globalBreaker } from '../src/breaker/circuit-breaker';
import { bufferToBase64 } from '../src/utils/encoding';

describe('Interceptor Edge Cases', () => {
  beforeEach(() => {
    globalInFlightRegistry.clear();
    globalBreaker.clear();
  });

  it('Gracefully handles native errors throwing during fetch', async () => {
    // Simulate a network-level rejection (e.g., DNS failure, connection refused)
    const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const intercepted = createFetchInterceptor(mockFetch);
    
    // Trigger an AI call that fails at network level
    const url = 'https://api.openai.com/v1/completions';
    
    // Await the rejection
    await expect(intercepted(url, { method: 'POST', body: '{}' })).rejects.toThrow('Failed to fetch');
    
    // The registry should be clean because the pipeline caught the error and threw it
    expect(globalInFlightRegistry.size).toBe(0);
  });

  it('Triggers the ArrayBuffer conversion path for XHR-like requests', async () => {
    // Some envs (like JSDOM) need XHR responses to be fully buffered.
    // We mock a response that looks like it should be buffered.
    const mockFetch = vi.fn().mockResolvedValue(new Response('content'));
    const intercepted = createFetchInterceptor(mockFetch);
    
    // Mark as XHR
    const res = await intercepted('https://api.openai.com/v1/completions', {
      method: 'POST',
      body: '{}',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    
    expect(await res.text()).toBe('content');
  });

  it('properly cleans up registry when broadcaster creation fails', async () => {
    // Specifically target the try/catch around ResponseBroadcaster creation
    const mockFetch = vi.fn().mockResolvedValue({
        // A response that is NOT cloneable or has other issues
        status: 200,
        ok: true,
        headers: new Headers(),
    } as any);
    
    const intercepted = createFetchInterceptor(mockFetch);
    const res = await intercepted('https://api.openai.com/v1/completions', {
        method: 'POST',
        body: '{}'
    });
    
    // Even if broadcaster fails, registry should eventually clean up
    // (In this case, it might just pass through)
    expect(res.status).toBe(200);
    expect(globalInFlightRegistry.size).toBe(0);
  });

  describe('Encoding Utilities Fallbacks', () => {
    it('bufferToBase64 uses btoa fallback when Buffer is missing', () => {
       const originalBuffer = globalThis.Buffer;
       // @ts-ignore
       globalThis.Buffer = undefined;
       
       try {
         const buffer = new TextEncoder().encode('test').buffer;
         const result = bufferToBase64(buffer);
         // 'test' in base64 is 'dGVzdA=='
         expect(result).toBe('dGVzdA==');
       } finally {
         globalThis.Buffer = originalBuffer;
       }
    });
  });
});
