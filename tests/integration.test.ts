import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as QuotaGuard from '../src/index';
import http from 'node:http';

describe('Quota Guard Public API (index.ts)', () => {
  it('exports all expected core utilities', () => {
    expect(QuotaGuard.injectQuotaGuard).toBeDefined();
    expect(QuotaGuard.getConfig).toBeDefined();
    expect(QuotaGuard.setConfig).toBeDefined();
    expect(QuotaGuard.globalCache).toBeDefined();
    expect(QuotaGuard.globalBreaker).toBeDefined();
    expect(QuotaGuard.unhookFetch).toBeDefined();
    expect(QuotaGuard.hookAxios).toBeDefined();
  });
});

describe('Full Integration Lifecycle', () => {
  afterEach(() => {
    QuotaGuard.unhookFetch();
    vi.restoreAllMocks();
  });

  it('hooks and unhooks fetch successfully in browser-like environment', async () => {
    const originalProcess = globalThis.process;
    Object.defineProperty(globalThis, 'process', {
      value: { ...originalProcess, versions: {} },
      configurable: true
    });

    const mockNativeFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockNativeFetch;

    QuotaGuard.injectQuotaGuard({ enabled: true, aiEndpoints: ['api.openai.com'] });
    expect(globalThis.fetch).not.toBe(mockNativeFetch);

    await globalThis.fetch('https://api.openai.com/v1/models');
    expect(mockNativeFetch).toHaveBeenCalled();

    QuotaGuard.unhookFetch();
    Object.defineProperty(globalThis, 'process', { value: originalProcess, configurable: true });
    globalThis.fetch = originalFetch;
  });

  it('hooks and unhooks using BatchInterceptor in Node-like environment', async () => {
    const originalProcess = globalThis.process;
    Object.defineProperty(globalThis, 'process', {
      value: { ...originalProcess, versions: { node: '20.0.0' } },
      configurable: true
    });

    QuotaGuard.unhookFetch();
    QuotaGuard.injectQuotaGuard({ enabled: true, aiEndpoints: ['localhost'] });
    
    // In Vitest/Node, we use http.request to ensure we trip the ClientRequestInterceptor
    // We use a local hostname to avoid real network calls if interception fails
    await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 8080, // arbitrary port
        path: '/v1/chat/completions',
        method: 'POST',
      }, (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', resolve); // Fail fast
      req.write(JSON.stringify({ model: 'gpt-4' }));
      req.end();
    });

    QuotaGuard.unhookFetch();
    Object.defineProperty(globalThis, 'process', { value: originalProcess, configurable: true });
  });
});
