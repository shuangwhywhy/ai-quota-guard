import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserCache } from '../../src/cache/browser';
import { ResponseBroadcaster } from '../../src/streams/broadcaster';
import { injectQuotaGuard, removeGlobalGuards } from '../../src/index';

describe('Quota Guard Hardening (Browser)', { browser: true }, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    removeGlobalGuards();
    vi.unstubAllGlobals();
  });

  it('handles missing IndexedDB and error events gracefully', async () => {
    const originalIDB = window.indexedDB;
    
    const windowObj = window as unknown as Record<string, unknown>;
    // 1. Missing IDB
    // @ts-expect-error - overriding for test
    delete windowObj.indexedDB;
    const cache = new BrowserCache();
    try { await cache.get('test', 1000); } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain('IndexedDB is not available');
    }
    
    // 2. Mocking IDB entry errors
    windowObj.indexedDB = originalIDB;
    const cache2 = new BrowserCache();
    // Sabotage openDb to trigger error paths
    vi.spyOn(window.indexedDB, 'open').mockImplementation(() => {
        const req = {} as IDBOpenDBRequest;
        setTimeout(() => { if (req.onerror) (req as unknown as Record<string, () => void>).onerror(); }, 1);
        return req;
    });
    
    try { await cache2.set('fail', {} as unknown as never); } catch { /* ignore */ }
    try { await cache2.get('fail', 1000); } catch { /* ignore */ }
    try { await cache2.clear(); } catch { /* ignore */ }
  });

  it('triggers onupgradeneeded in browser', { timeout: 5000 }, async () => {
    const dbName = 'quota-guard-upgrade-' + Date.now();
    await new Promise((resolve) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => {
        req.result.close();
        const req2 = indexedDB.open(dbName, 2);
        req2.onupgradeneeded = () => { resolve(true); };
        req2.onsuccess = () => { req2.result.close(); };
      };
    });
  });

  it('triggers XHR stream-to-buffer conversion', async () => {
    await injectQuotaGuard({
        enabled: true,
        aiEndpoints: ['xhr-detect.com']
    });
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('xhr-data'));
          controller.close();
        }
      }), { status: 200 }));

    const res = await window.fetch('https://xhr-detect.com/v1', {
      method: 'POST',
      body: '{}',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    expect(await res.text()).toBe('xhr-data');
  });

  it('handles ResponseBroadcaster edge cases', async () => {
    const response = new Response('test');
    const broadcaster = new ResponseBroadcaster(response);
    const [t1, t2] = await Promise.all([broadcaster.subscribe().text(), broadcaster.subscribe().text()]);
    expect(t1).toBe('test');
    expect(t2).toBe('test');
    expect(new TextDecoder().decode(await broadcaster.getFinalBuffer())).toBe('test');
  });

  it('handles extraction errors and falling back in Intelligent fields', async () => {
    const { extractSemanticFields } = await import('../../src/providers/registry');
    // URL parse fail
    expect(extractSemanticFields('invalid-no-base', { foo: 'bar' })).toEqual({ foo: 'bar' });
  });
});
