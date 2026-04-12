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
        // @ts-expect-error
        p.logFingerprintConflict(current as any, original as any, 'key');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('COLLISION'));
        warnSpy.mockRestore();
    });

    it('covers Global Breaker (pipeline Line 80)', async () => {
        const { globalBreaker } = await import('../../src/breaker/circuit-breaker');
        vi.spyOn(globalBreaker, 'isGlobalOpen').mockReturnValue(true);
        const p = new GuardPipeline(() => {});
        const req = new Request('https://api.openai.com/v1/chat');
        // @ts-expect-error
        const res = await p.processRequest(req, getConfig());
        expect(res.status).toBe('BREAKER');
    });

    it('covers interceptor error & recovery (Line 82, 199-203, 209)', async () => {
        const mockPipeline = new GuardPipeline(vi.fn());
        __injectTestPipeline(mockPipeline);
        await applyGlobalGuards();

        // 1. Hit Line 209 (Global Catch)
        vi.spyOn(mockPipeline, 'processRequest').mockImplementation(() => {
            throw new Error('sync-fatal');
        });
        try { await fetch('https://api.openai.com/v1/chat'); } catch {}

        // 2. Hit Line 200 (request_failed)
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'fail',
            resolveBroadcaster: vi.fn()
        });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('err', { status: 400 }));
        await fetch('https://api.openai.com/v1/chat');
        globalThis.fetch = originalFetch;

        // 3. Hit Line 82 (startBroadcasting catch)
        // We'll mock pipeline.processRequest to return something that makes startBroadcasting fail.
        // startBroadcasting calls new ResponseBroadcaster(response).
        // If we provide a "response" that isn't really a Response or has a weird getter...
        vi.spyOn(mockPipeline, 'processRequest').mockResolvedValue({
            key: 'weird',
            response: { headers: { get: () => { throw new Error('headers-fail'); } } } as any,
            resolveBroadcaster: vi.fn()
        });
        try { await fetch('https://api.openai.com/v1/chat'); } catch {}
    });
});
