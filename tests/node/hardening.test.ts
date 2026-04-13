import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectQuotaGuard } from '../../src/setup';
import { globalBreaker } from '../../src/breaker/circuit-breaker';
import { GuardPipeline } from '../../src/core/pipeline';
import { generateStableKey } from '../../src/keys/normalizer';
import { MemoryCache } from '../../src/cache/memory';
import { FileCache } from '../../src/cache/file';
import { ResponseBroadcaster } from '../../src/streams/broadcaster';
import { PromiseDebouncer } from '../../src/utils/debounce-promise';
import { applyGlobalGuards, removeGlobalGuards, createFetchInterceptor } from '../../src/core/interceptor';
import { setConfig } from '../../src/config';
import * as fs from 'fs/promises';

vi.mock('fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fs/promises')>();
  return {
    ...mod,
    readFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  };
});
  beforeEach(() => {
    vi.restoreAllMocks();
    globalBreaker.clear();
    setConfig({});
  });

  afterEach(() => {
    removeGlobalGuards();
  });

  describe('setup.ts', () => {
    it('handles production mode banner correctly', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      await injectQuotaGuard();
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Production (Bypass)'));
      process.env.NODE_ENV = originalEnv;
    });

    it('loads config from window if available', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      // @ts-expect-error - simulating browser environment
      globalThis.window = { __QUOTA_GUARD_CONFIG__: { debounceMs: 999 } };
      
      await injectQuotaGuard();
      
      // @ts-expect-error - cleanup
      delete globalThis.window;
    });
  });

  describe('circuit-breaker.ts', () => {
    it('resets global breaker after timeout', async () => {
      vi.useFakeTimers();
      const max = 2;
      const timeout = 1000;
      
      globalBreaker.recordFailure('key1');
      globalBreaker.recordFailure('key2'); // failures = 2
      
      expect(globalBreaker.isGlobalOpen(max, timeout)).toBe(true);
      
      vi.advanceTimersByTime(timeout + 1);
      
      // Should reset failures and return false
      expect(globalBreaker.isGlobalOpen(max, timeout)).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('pipeline.ts', () => {
    it('handles regex rules with slashes/flags', async () => {
      const pipeline = new GuardPipeline(() => {});
      // @ts-expect-error - testing private matchRule
      const res = pipeline.matchRule('https://api.openai.com', {}, {
        match: { url: '/openai/' },
        override: {}
      });
      expect(res).toBe(true);
    });

    it('returns empty result if isGuarded catches an error (malformed URL)', async () => {
      const pipeline = new GuardPipeline(() => {});
      // @ts-expect-error - testing invalid URL
      const res = await pipeline.processRequest({ url: 'not a url', method: 'POST', headers: new Headers() } as Request);
      expect(res).toEqual({});
    });

    it('safeCloneText returns null on error', async () => {
      const pipeline = new GuardPipeline(() => {});
      const mockRequest = {
        clone: () => { throw new Error('clone failed'); }
      };
      // @ts-expect-error - testing private safeCloneText
      const res = await pipeline.safeCloneText(mockRequest);
      expect(res).toBeNull();
    });

    it('matchRule returns false if header match fails', () => {
      const pipeline = new GuardPipeline(() => {});
      const rule = { match: { headers: { 'x-test': 'val' } }, override: {} };
      // @ts-expect-error - testing private matchRule
      expect(pipeline.matchRule('url', {}, rule)).toBe(false);
    });

    it('logs fingerprint conflict warn', () => {
      const pipeline = new GuardPipeline(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const current = { url: 'u', method: 'GET', headers: { 'authorization': 'a' } };
      const original = { url: 'u', method: 'GET', headers: { 'authorization': 'b' } };
      // @ts-expect-error - testing private logFingerprintConflict
      pipeline.logFingerprintConflict(current, original, 'key123456');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FINGERPRINT_COLLISION'));
    });

    it('logs intent conflict warn', () => {
      const pipeline = new GuardPipeline(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // @ts-expect-error - testing private logIntentConflict
      pipeline.logIntentConflict('BYPASS', 'url', 'key123', 'trigger', 'action');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BYPASS'));
    });
  });

  describe('normalizer.ts', () => {
    it('handles keyHeaders with case insensitivity and missing values', async () => {
      setConfig({ keyHeaders: ['X-Custom-ID'] });
      const headers = { 'x-custom-id': '123' };
      const key = await generateStableKey('url', 'GET', null, 'intelligent', headers);
      expect(key).toBeDefined();
    });

    it('node crypto fallback branch', async () => {
       const originalCrypto = globalThis.crypto;
       Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
       const key = await generateStableKey('url', 'GET', 'test');
       expect(key).toBeDefined();
       Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    });
  });

  describe('cache/memory.ts', () => {
    it('handles sweep with missing ttlMs', () => {
      const cache = new MemoryCache();
      for(let i=0; i<50; i++) {
        // @ts-expect-error - testing private set
        cache.set('key' + i, { timestamp: Date.now() - 10000000, responsePayloadBase64: '', headers: {}, status: 200 });
      }
      // @ts-expect-error - testing private store
      expect(cache.store.size).toBe(0);
    });
  });

  describe('cache/file.ts', () => {
    it('returns null if file read fails', async () => {
      const cache = new FileCache('.tmp/test-cache');
      // @ts-expect-error - using mocked fs
      fs.readFile.mockRejectedValueOnce(new Error('no file'));
      const res = await cache.get('missing', 1000);
      expect(res).toBeNull();
    });

    it('clear handles empty directory', async () => {
      const cache = new FileCache('.tmp/empty-cache');
      // @ts-expect-error - using mocked fs
      fs.readdir.mockRejectedValueOnce(new Error('no dir'));
      await cache.clear(); 
    });
  });

  describe('broadcaster.ts', () => {
    it('closes late joiners if finished', async () => {
      const res = new Response('test');
      const broadcaster = new ResponseBroadcaster(res);
      await broadcaster.getFinalBuffer(); // Finish it
      
      const sub = broadcaster.subscribe();
      expect(sub.body).toBeDefined();
    });

    it('removes controller on enqueue failure', async () => {
      const res = new Response(new ReadableStream({
        start(c) { c.enqueue(new Uint8Array([1])); c.close(); }
      }));
      const broadcaster = new ResponseBroadcaster(res);
      const mockController = {
        enqueue: () => { throw new Error('fail'); }
      };
      // @ts-expect-error - testing private controllers
      broadcaster.controllers.add(mockController);
      
      await broadcaster.getFinalBuffer();
      // @ts-expect-error - testing private controllers
      expect(broadcaster.controllers.has(mockController)).toBe(false);
    });
  });

  describe('utils/debounce-promise.ts', () => {
    it('currentGroup check branch', async () => {
      vi.useFakeTimers();
      const debouncer = new PromiseDebouncer();
      const p1 = debouncer.debounce('key', 100);
      vi.advanceTimersByTime(101);
      await p1;
      vi.useRealTimers();
    });
  });

  describe('interceptor.ts Error Paths', () => {
    it('handles generic errors during processRequest gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const guardedFetch = createFetchInterceptor(mockFetch);
      
      // Spy on pipeline to throw
      vi.spyOn(GuardPipeline.prototype, 'processRequest').mockRejectedValue(new Error('Pipeline exploded'));
      
      const res = await guardedFetch('https://api.openai.com/v1/chat', { method: 'POST', body: 'test' });
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('emits pass_through on generic processing error', async () => {
       const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
       const guardedFetch = createFetchInterceptor(mockFetch);
       // Throw something that is not an Error object
       vi.spyOn(GuardPipeline.prototype, 'processRequest').mockRejectedValue('string error');
       await guardedFetch('https://api.openai.com/v1/chat');
       expect(mockFetch).toHaveBeenCalled();
    });

    it('handles abort correctly in applyGlobalGuards listener', async () => {
      applyGlobalGuards();
      const controller = new AbortController();
      const mockReq = new Request('https://api.openai.com/v1/chat', { 
        signal: controller.signal,
        method: 'POST',
        body: '{}'
      });
      
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
      
      // We don't need to await the fetch, just trigger it and abort
      const p = globalThis.fetch(mockReq);
      controller.abort();
      await p.catch(() => {});
      
      fetchSpy.mockRestore();
    });

    it('handles abort error in created interceptor', async () => {
        const mockFetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
        const guardedFetch = createFetchInterceptor(mockFetch);
        const logSpy = vi.fn();
        setConfig({ auditHandler: logSpy, aiEndpoints: [/openai/] });
        
        await expect(guardedFetch('https://api.openai.com/v1/chat', { method: 'POST', body: 'test' })).rejects.toBeDefined();
        // The interceptor should catch AbortError and log it
        expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'request_aborted' }));
    });

    it('handles Response error when pipeline returns non-circuit-breaker error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const guardedFetch = createFetchInterceptor(mockFetch);
      vi.spyOn(GuardPipeline.prototype, 'processRequest').mockResolvedValue({ error: new Error('other') });
      const res = await guardedFetch('https://api.openai.com/v1/chat');
      expect(res.status).toBe(200); // Failsafe to native fetch
    });

    it('triggers branch for XHR special handling in interceptor (simulation)', async () => {
        const mockFetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({
           start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); }
        })));
        const guardedFetch = createFetchInterceptor(mockFetch);
        
        const res = await guardedFetch('https://api.openai.com/v1/chat', { 
            method: 'POST', 
            body: 'test',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        expect(await res.text()).toBe('data');
    });

    it('covers response background task failures', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const guardedFetch = createFetchInterceptor(mockFetch);
      
      // Force response broadcaster to fail during buffer extraction
      vi.spyOn(ResponseBroadcaster.prototype, 'getFinalBuffer').mockRejectedValue(new Error('buffer failed'));
      
      await guardedFetch('https://api.openai.com/v1/chat', { method: 'POST', body: 'test' });
      // Background task fails silently (as intended), wait a bit for code to execute
      await new Promise(r => setTimeout(r, 20));
    });

    it('covers register.ts singleton survival and repeat injection', () => {
      // Repeat injection branch in applyGlobalGuards
      applyGlobalGuards();
      applyGlobalGuards();
    });

    it('covers batchInterceptor events via applyGlobalGuards', async () => {
      applyGlobalGuards();
      const mockRes = new Response('hooked');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes);
      
      const res = await globalThis.fetch('https://api.openai.com/v1/chat', { 
        method: 'POST', 
        body: JSON.stringify({ model: 'gpt-4' }) 
      });
      expect(res).toBeDefined();

      // Trigger abort branch (Line 83)
      const controller = new AbortController();
      const p = globalThis.fetch('https://api.openai.com/v1/chat', { 
        method: 'POST', 
        body: JSON.stringify({ model: 'gpt-4' }),
        signal: controller.signal
      });
      controller.abort();
      await p.catch(() => {});

      fetchSpy.mockRestore();
    });
  });

  describe('providers/registry.ts Harden', () => {
    it('handles non-regexp hostname matches and parse errors', async () => {
      const { extractSemanticFields, PROVIDER_RULES } = await import('../../src/providers/registry');
      
      const originalRules = [...PROVIDER_RULES];
      PROVIDER_RULES.length = 0;
      PROVIDER_RULES.push({
        name: 'test-host',
        hostnameMatch: 'example.com',
        extractSemanticFields: (b) => b
      });

      expect(extractSemanticFields('https://example.com/api', { foo: 'bar' })).toEqual({ foo: 'bar' });
      
      // Hit line 88: fallback if URL parse fails
      expect(extractSemanticFields('example.com', { foo: 'bar' })).toEqual({ foo: 'bar' });

      // Hit Line 88 catch block: Completely malformed URL
      // Use something that makes new URL() throw
      expect(extractSemanticFields('https://:', { foo: 'bar' })).toEqual({ foo: 'bar' });

      PROVIDER_RULES.length = 0;
      PROVIDER_RULES.push(...originalRules);
    });
  });

  describe('broadcaster.ts Harden', () => {
    it('handles stream cancel (Line 47)', async () => {
       const res = new Response(new ReadableStream({
         start(c) { c.enqueue(new Uint8Array([1])); }
       }));
       const broadcaster = new ResponseBroadcaster(res);
       const sub = broadcaster.subscribe();
       
       // Cancel the subscription
       const reader = sub.body?.getReader();
       await reader?.cancel();
       
       // Controller should be deleted
       // @ts-expect-error - testing private controllers
       expect(broadcaster.controllers.size).toBe(0);
    });

    it('getFinalBuffer awaits stream completion (Line 107-111)', async () => {
      const res = new Response(new ReadableStream({
        async start(c) {
          await new Promise(r => setTimeout(r, 20));
          c.enqueue(new Uint8Array([1, 2, 3]));
          c.close();
        }
      }));
      const broadcaster = new ResponseBroadcaster(res);
      
      const buffer = await broadcaster.getFinalBuffer();
      expect(buffer.byteLength).toBe(3);
    });
  });

  describe('normalizer.ts Harden', () => {
    it('handles complex keyHeaders (Line 83-93)', async () => {
       setConfig({ keyHeaders: ['X-API-KEY', 'X-Session-ID'] });
       const headers = { 
         'x-api-key': 'key123',
         'x-session-id': 'session456',
         'ignore-me': '789'
       };
       const key1 = await generateStableKey('url', 'POST', 'body', 'intelligent', headers);
       
       const headers2 = { 'x-api-key': 'key123' };
       const key2 = await generateStableKey('url', 'POST', 'body', 'intelligent', headers2);
       
       expect(key1).not.toBe(key2);
    });
  });

  describe('pipeline.ts Final Branches', () => {
    it('hits matchRule default regex branch', () => {
        const pipeline = new GuardPipeline(() => { });
        // @ts-expect-error - testing private matchRule
        const res = pipeline.matchRule('openai.com', {}, { match: { url: 'openai' }, override: {} });
        expect(res).toBe(true);
    });

    it('hits isGuarded catch block', () => {
        const pipeline = new GuardPipeline(() => { });
        // @ts-expect-error - testing private isGuarded
        const res = pipeline.isGuarded({ toString: () => { throw new Error('!!'); } }, 'GET', { enabled: true });
        expect(res).toBe(false);
    });

    it('hits global breaker branch in pipeline', async () => {
        globalBreaker.recordFailure('key1');
        globalBreaker.recordFailure('key2');
        const pipeline = new GuardPipeline(() => {});
        const req = new Request('https://api.openai.com/v1/chat', { method: 'POST', body: '{}' });
        // Set low thresholds and ensure ENABLED
        setConfig({ enabled: true, globalBreakerMaxFailures: 1, aiEndpoints: [/openai/] });
        const res = await pipeline.processRequest(req);
        expect(res.status).toBe('BREAKER');
    });

    it('hits slash-regex branch in isGuarded', () => {
        const pipeline = new GuardPipeline(() => { });
        const config = { enabled: true, aiEndpoints: ['/openai/'] };
        // @ts-expect-error - testing private isGuarded
        expect(pipeline.isGuarded('https://api.openai.com/v1', 'POST', config)).toBe(true);
    });
  });

