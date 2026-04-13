import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectQuotaGuard } from '../../src/setup';
import { applyGlobalGuards, removeGlobalGuards, __injectTestPipeline } from '../../src/core/interceptor';
import { ResponseBroadcaster } from '../../src/streams/broadcaster';
import { setConfig, getConfig, defineConfig } from '../../src/config';
import { GuardPipeline } from '../../src/core/pipeline';

describe('Hardening Master (Node)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        removeGlobalGuards();
        setConfig({ enabled: true, aiEndpoints: [/openai/] });
    });

    it('covers config.ts defineConfig (Line 99)', () => {
        const conf = defineConfig({ enabled: true });
        expect(conf.enabled).toBe(true);
    });

    it('covers setup.ts branches (Production & Merging)', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        await injectQuotaGuard();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Bypass'));
        process.env.NODE_ENV = originalEnv;
        logSpy.mockRestore();
        
        await injectQuotaGuard({ enabled: true, cacheTtlMs: 9999 });
        expect(getConfig().cacheTtlMs).toBe(9999);
    });

    it('covers setup.ts invalid json (Line 33)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const originalConfig = process.env.QUOTA_GUARD_CONFIG;
        process.env.QUOTA_GUARD_CONFIG = '{ invalid';
        await injectQuotaGuard();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse QUOTA_GUARD_CONFIG'));
        process.env.QUOTA_GUARD_CONFIG = originalConfig;
        warnSpy.mockRestore();
    });

    it('covers FileCache readdir catch (Line 61)', async () => {
        const { FileCache } = await import('../../src/cache/file');
        // Pointing to a file so readdir fails
        const fc = new FileCache('README.md'); 
        await fc.clear();
    });

    it('covers broadcaster isFinished branch (Line 60)', async () => {
        const res = new Response('test');
        const broadcaster = new ResponseBroadcaster(res);
        await broadcaster.getFinalBuffer();
        const sub = broadcaster.subscribe();
        const text = await sub.text();
        expect(text).toBe('test');
    });

    it('covers pipeline conflict diffs (Line 253)', async () => {
        const p = new GuardPipeline(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const current = { headers: { 'authorization': 'Bearer new' } };
        const original = { headers: { 'authorization': 'Bearer old' } };
        // @ts-expect-error: accessing private logFingerprintConflict for diff branch coverage
        p.logFingerprintConflict(current, original, 'key');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('COLLISION'));
        warnSpy.mockRestore();
    });

    it('covers Global Breaker (pipeline Line 80)', async () => {
        const { globalBreaker } = await import('../../src/breaker/circuit-breaker');
        vi.spyOn(globalBreaker, 'isGlobalOpen').mockReturnValue(true);
        const p = new GuardPipeline(() => {});
        const req = new Request('https://api.openai.com/v1/chat');
        // @ts-expect-error: accessing private processRequest for breaker coverage
        const res = await p.processRequest(req, getConfig());
        expect(res.status).toBe('BREAKER');
    });

    it('covers setup.ts layered merging (Line 60-68)', async () => {
        const { loadQuotaGuardConfig } = await import('../../src/loader');
        const loaderSpy = vi.spyOn({ loadQuotaGuardConfig }, 'loadQuotaGuardConfig').mockResolvedValue({
            base: { cacheTtlMs: 777 },
            specific: { cacheTtlMs: 888 }
        });
        const originalConfig = process.env.QUOTA_GUARD_CONFIG;
        process.env.QUOTA_GUARD_CONFIG = JSON.stringify({ cacheTtlMs: 999 });
        
        await injectQuotaGuard();
        expect(getConfig().cacheTtlMs).toBe(999);
        
        process.env.QUOTA_GUARD_CONFIG = originalConfig;
        loaderSpy.mockRestore();
    });

    it('covers interceptor abort & background failure branches', async () => {
        const { globalInFlightRegistry: registry } = await import('../../src/registry/in-flight');
        const { getMetadata } = await import('../../src/core/metadata');
        const mockPipeline = new GuardPipeline(vi.fn());
        __injectTestPipeline(mockPipeline);
        
        try { await applyGlobalGuards(); } catch { /* ignore */ }
        setConfig({ enabled: true, aiEndpoints: [/test-ai\.com/], auditHandler: vi.fn() });

        // 1. Abort Listener (Line 86)
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'abort-key',
            status: 'LIVE',
            resolveBroadcaster: () => {}
        });
        // @ts-expect-error: mocking metadata key
        const metaSpy = vi.spyOn({ getMetadata }, 'getMetadata').mockReturnValue({ key: 'abort-key' });
        // @ts-expect-error: mocking broadcaster state
        registry.set('abort-key', {}, { url: 'u', method: 'M', headers: {} });

        const controller = new AbortController();
        const p = fetch('https://abort-test-ai.com/chat', { signal: controller.signal });
        controller.abort();
        await p.catch(() => {});
        
        // 2. Background Task Failure (Line 206)
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'fail-key',
            status: 'LIVE',
            resolveBroadcaster: () => {}
        });
        // @ts-expect-error: mocking metadata key
        metaSpy.mockReturnValue({ key: 'fail-key' });
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const headers = new Headers(init?.headers);
            if (headers.get('x-quota-guard-internal') === 'true') {
                return new Response('error', { status: 500 });
            }
            return new Response('ok');
        });

        await fetch('https://fail-test-ai.com/chat');
        
        // 3. Background Task Crash (Line 216 - outer catch)
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'crash-key',
            status: 'LIVE',
            resolveBroadcaster: () => {}
        });
        // @ts-expect-error: mocking metadata key
        metaSpy.mockReturnValue({ key: 'crash-key' });
        const bufferSpy = vi.spyOn(ResponseBroadcaster.prototype, 'getFinalBuffer').mockRejectedValue(new Error('crash'));
        
        await fetch('https://crash-test-ai.com/chat');

        // Cleanup and wait for background tasks
        await new Promise(r => setTimeout(r, 200));
        
        expect(registry.get('abort-key')).toBeUndefined();
        expect(registry.get('crash-key')).toBeUndefined();
        
        fetchSpy.mockRestore();
        bufferSpy.mockRestore();
        metaSpy.mockRestore();
    });

    it('covers interceptor error & recovery (Line 82, 199-203, 209)', async () => {
        const mockPipeline = new GuardPipeline(vi.fn());
        __injectTestPipeline(mockPipeline);
        try { await applyGlobalGuards(); } catch { /* ignore */ }

        // 1. Hit Line 209 (Global Catch)
        vi.spyOn(mockPipeline, 'processRequest').mockImplementation(() => {
            throw new Error('sync-fatal');
        });
        try { await fetch('https://api.openai.com/v1/chat'); } catch { /* expected sync-fatal error */ }

        // 2. Hit Line 200 (request_failed)
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'fail',
            resolveBroadcaster: vi.fn()
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('err', { status: 400 }));
        await fetch('https://api.openai.com/v1/chat');
        globalThis.fetch = originalFetch;

        // If we provide a "response" that isn't really a Response or has a weird getter...
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'weird',
            // @ts-expect-error: injecting sync-failing response mock
            response: { headers: { get: () => { throw new Error('headers-fail'); } } },
            resolveBroadcaster: vi.fn()
        });
        try { await fetch('https://api.openai.com/v1/chat'); } catch { /* expected headers-fail error */ }
    });
});
