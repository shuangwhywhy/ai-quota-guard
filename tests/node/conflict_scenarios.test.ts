import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GuardPipeline } from '../../src/core/pipeline';
import { setConfig, getDefaultConfig, getConfig } from '../../src/config';
import { globalCache } from '../../src/cache/memory';
import { globalInFlightRegistry } from '../../src/registry/in-flight';
import { generateStableKey } from '../../src/keys/normalizer';

describe('Quota Guard - Conflict Scenarios (E2E Logic)', () => {
    let pipeline: GuardPipeline;
    const emitAudit: ReturnType<typeof vi.fn> = vi.fn();
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        pipeline = new GuardPipeline(emitAudit);
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setConfig(getDefaultConfig());
        globalCache.clear();
        globalInFlightRegistry.clear();
        consoleWarnSpy.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('Scenario 1: Rule Engine overrides global debounce config', async () => {
        const url = 'https://api.openai.com/v1/chat/special';
        setConfig({
            enabled: true,
            aiEndpoints: ['api.openai.com'],
            debounceMs: 1000, // Global is slow
            rules: [
                {
                    match: { url: /.*\/special/ }, // This endpoint is special
                    override: { debounceMs: 0 } // No debounce for special
                }
            ]
        });

        const start = Date.now();
        const request = new Request(url, { method: 'POST', body: '{"test":1}' });
        await pipeline.processRequest(request);
        const duration = Date.now() - start;

        // Should NOT have waited 1000ms
        expect(duration).toBeLessThan(500); 
    });

    it('Scenario 2: Intent Conflict (Bypass Ignored) logs warning but serves from cache', async () => {
        const url = 'https://api.openai.com/v1/chat';
        const body = '{"prompt":"hello"}';
        // 1. Generate the REAL key that the pipeline will use
        const preheatRequest = new Request(url, {
            method: 'POST',
            body,
            headers: { 'cache-control': 'no-cache' }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headersMap = (pipeline as any).getHeadersMap(preheatRequest);
        const key = await generateStableKey(url, 'POST', body, 'intelligent', headersMap);

        await globalCache.set(key!, {
            responsePayloadBase64: 'e30=',
            headers: {},
            status: 200,
            timestamp: Date.now(),
            requestSnapshot: { url, method: 'POST', headers: {} }
        });

        // 2. Request with bypass header
        const request = new Request(url, {
            method: 'POST',
            body,
            headers: { 'cache-control': 'no-cache' }
        });

        const result = await pipeline.processRequest(request);

        // Result is served from cache (Safety Priority)
        expect(result.isHit).toBe(true);
        // But a warning is logged
        expect(consoleWarnSpy).toHaveBeenCalled();
        const lastWarning = consoleWarnSpy.mock.calls[0][0];
        expect(lastWarning).toContain('[BYPASS_IGNORED]');
    });

    it('Scenario 3: Header-based Rule Matching', async () => {
        const url = 'https://api.openai.com/v1/chat';
        setConfig({
            enabled: true,
            aiEndpoints: ['api.openai.com'],
            rules: [
                {
                    match: { headers: { 'x-action': 'bypass-safety' } },
                    override: { cacheTtlMs: 0 }
                }
            ]
        });

        const headers = { 'x-action': 'bypass-safety', 'content-type': 'application/json' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const effective = (pipeline as any).getEffectiveConfig(url, headers, getConfig());
        expect(effective.cacheTtlMs).toBe(0);
    });
});
