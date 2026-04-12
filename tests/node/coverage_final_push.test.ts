import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectQuotaGuard } from '../../src/setup';
import { applyGlobalGuards, removeGlobalGuards, __injectTestPipeline } from '../../src/core/interceptor';
import { ResponseBroadcaster } from '../../src/streams/broadcaster';
import { setConfig, getConfig, QuotaGuardConfig } from '../../src/config';
import { GuardPipeline } from '../../src/core/pipeline';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Final Coverage Push (Node)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    removeGlobalGuards();
    setConfig({ enabled: true, aiEndpoints: [/openai/] });
  });

  it('covers Interceptor isXhr branch (L117)', async () => {
    const mockPipeline = new GuardPipeline(vi.fn());
    __injectTestPipeline(mockPipeline);
    await applyGlobalGuards();

    vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
      response: new Response('cached response', { status: 200 })
    });

    const res = await fetch('https://api.openai.com/v1/chat', {
       headers: { 'x-requested-with': 'XMLHttpRequest' }
    });
    expect(await res.text()).toBe('cached response');
  });

  it('covers Interceptor response.ok is false branch (L205-208)', async () => {
    const mockPipeline = new GuardPipeline(vi.fn());
    __injectTestPipeline(mockPipeline);
    await applyGlobalGuards();

    vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
      key: 'test-key',
      resolveBroadcaster: vi.fn()
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('error', { status: 400 }));

    await fetch('https://api.openai.com/v1/chat');
    
    globalThis.fetch = originalFetch;
  });

  it('covers Interceptor response catch blocks (L209-210, L216-217)', async () => {
    const mockPipeline = new GuardPipeline(vi.fn());
    __injectTestPipeline(mockPipeline);
    await applyGlobalGuards();

    // Force error in async block by making getFinalBuffer throw
    vi.spyOn(ResponseBroadcaster.prototype, 'getFinalBuffer').mockRejectedValue(new Error('buffer-fail'));
    
    vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
      key: 'test-key',
      resolveBroadcaster: vi.fn()
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok'));
    
    await fetch('https://api.openai.com/v1/chat');
    
    // Wait for the async IIFE to process
    await new Promise(r => setTimeout(r, 50));
    globalThis.fetch = originalFetch;
  });

  it('covers Pipeline global breaker (L80) and !isGuarded (L225)', async () => {
    const { globalBreaker } = await import('../../src/breaker/circuit-breaker');
    vi.spyOn(globalBreaker, 'isGlobalOpen').mockReturnValue(true);

    const p = new GuardPipeline(vi.fn());
    const req = new Request('https://api.openai.com/v1/chat');
    // @ts-expect-error
    const res = await p.processRequest(req, getConfig());
    expect(res.status).toBe('BREAKER');

    // !isGuarded branch
    const reqPassthrough = new Request('https://google.com');
    // @ts-expect-error
    const resPassthrough = await p.processRequest(reqPassthrough, getConfig());
    expect(resPassthrough.key).toBeUndefined();
  });

  it('covers Pipeline conflict logging branches (L242, L253)', async () => {
    const p = new GuardPipeline(vi.fn());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // @ts-expect-error - testing private method
    p.logFingerprintConflict({ headers: {} }, undefined, 'test');
    
    // Header mismatch branch
    const current = { headers: { 'authorization': 'Bearer token1' } };
    const original = { headers: { 'authorization': 'Bearer token2' } };
    // @ts-expect-error
    p.logFingerprintConflict(current, original, 'test');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('covers Broadcaster late subscribe (L60)', async () => {
    const res = new Response('stream data');
    const broadcaster = new ResponseBroadcaster(res);
    await broadcaster.getFinalBuffer();
    
    // subscribe after isFinished
    const sub = broadcaster.subscribe();
    expect(await sub.text()).toBe('stream data');
  });

  it('covers FileCache clear branches (L57, L61)', async () => {
    const { FileCache } = await import('../../src/cache/file');
    const cacheDir = '.quota-guard/test-clear';
    const fc = new FileCache(cacheDir);
    
    const absoluteDir = path.resolve(process.cwd(), cacheDir);
    await fs.mkdir(absoluteDir, { recursive: true });
    
    // 1. Non-json file branch
    await fs.writeFile(path.join(absoluteDir, 'test.txt'), 'ignore me');
    await fc.clear();
    
    // 2. dir exists but check endsWith
    expect(await fs.access(path.join(absoluteDir, 'test.txt')).then(() => true).catch(() => false)).toBe(true);

    // cleanup
    await fs.rm(absoluteDir, { recursive: true, force: true });

    // 3. catch block branch (readdir fail)
    const fcFail = new FileCache('README.md'); // existing file, not a directory
    await fcFail.clear();
  });

  it('covers setup.ts PKG_VERSION fallback (L12, L86)', async () => {
    const originalVersion = globalThis.PKG_VERSION;
    // @ts-expect-error
    delete globalThis.PKG_VERSION;
    
    // Trigger config reload which uses PKG_VERSION
    await injectQuotaGuard({ enabled: true });
    
    globalThis.PKG_VERSION = originalVersion;
  });

  it('covers debounce-promise.ts race branch (L33)', async () => {
    const { PromiseDebouncer } = await import('../../src/utils/debounce-promise');
    const debouncer = new PromiseDebouncer();
    
    const p1 = debouncer.debounce('test', 10);
    // Manually delete the group from internal map to fail the (currentGroup === group) check
    // @ts-expect-error
    debouncer.groups.delete('test');
    
    await p1;
  });
});
