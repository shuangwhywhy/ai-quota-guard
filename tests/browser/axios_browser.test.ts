import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hookAxios } from '../../src/axios';
import { injectQuotaGuard, unhookFetch } from '../../src/index';

describe('Axios Browser Hook', { browser: true }, () => {
    let nativeFetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        nativeFetchSpy = vi.fn().mockImplementation(async () => {
            return new Response(JSON.stringify({ axios: 'browser-ok' }), { status: 200 });
        });
        vi.stubGlobal('fetch', nativeFetchSpy);

        // Clear IndexedDB
        await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase('quota-guard-cache');
            req.onsuccess = resolve;
            req.onerror = resolve;
        });

        injectQuotaGuard({
            enabled: true,
            aiEndpoints: ['openai.com'],
            debounceMs: 0
        });
    });

    afterEach(() => {
        unhookFetch();
        vi.unstubAllGlobals();
    });

    it('forces Axios to use fetch adapter and triggers interception', async () => {
        // Mock a minimal Axios instance
        const interceptors = {
            request: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                use: vi.fn((fn: (c: any) => any) => { interceptors.request.handler = fn; }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                handler: null as ((c: any) => any) | null
            }
        };

        const mockAxios = {
            interceptors,
            VERSION: '1.7.0'
        };

        hookAxios(mockAxios);
        expect(interceptors.request.use).toHaveBeenCalled();

        // Simulate Axios request processing
        const config = { url: 'https://openai.com/v1/chat', method: 'post' };
        const finalConfig = interceptors.request.handler(config);

        expect(finalConfig.adapter).toBe('fetch');

        // In a real Axios run with adapter: 'fetch', it would call window.fetch.
        // We simulate that call which should be intercepted.
        const res = await window.fetch(finalConfig.url, { method: finalConfig.method });
        const data = await res.json();

        expect(data.axios).toBe('browser-ok');
        expect(nativeFetchSpy).toHaveBeenCalledTimes(1);

        // Subsequent call should be cached (interceptor handled it)
        const res2 = await window.fetch(finalConfig.url, { method: finalConfig.method });
        await res2.json();
        expect(nativeFetchSpy).toHaveBeenCalledTimes(1); 
    });
});
