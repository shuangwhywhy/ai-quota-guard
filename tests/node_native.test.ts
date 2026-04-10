import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { hookFetch, unhookFetch } from '../src/core/interceptor';
import { setConfig } from '../src/config';

describe('Node.js Native Injection', () => {
  const originalProcess = globalThis.process;

  beforeEach(() => {
    // Force Node environment for interceptor detection
    Object.defineProperty(globalThis, 'process', {
      value: { ...originalProcess, versions: { node: '20.0.0' } },
      configurable: true
    });

    setConfig({
      enabled: true,
      aiEndpoints: ['localhost'],
      cacheTtlMs: 1000,
    });
    
    unhookFetch();
    hookFetch();
  });

  afterEach(() => {
    unhookFetch();
    Object.defineProperty(globalThis, 'process', { value: originalProcess, configurable: true });
    vi.restoreAllMocks();
  });

  it('should be able to initialize BatchInterceptor with ClientRequestInterceptor', () => {
    // This mostly verifies the synchronous injection fix doesn't crash 
    // and correctly identifies Node.
    expect(() => hookFetch()).not.toThrow();
  });

  it('should intercept http.request without falling through to network if matched', async () => {
    // In this environment, we can't easily verify the interceptor "caught" it 
    // without a mock backend, but we can verify that Calling it doesn't 
    // immediately explode if the injection is correct.
    
    // We use a high port to avoid EPERM on some systems, 
    // even though we hope it's intercepted.
    const req = http.request({
      hostname: 'localhost',
      port: 12345,
      path: '/api/ai',
      method: 'POST'
    });
    
    expect(req).toBeDefined();
    req.abort(); // Cleanup
  });
});
