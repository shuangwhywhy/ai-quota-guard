import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectQuotaGuard, removeGlobalGuards } from '../../src/index';

describe('Global Fetch Interception (Browser)', { browser: true }, () => {
    let nativeFetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        // Mock the underlying network
        nativeFetchSpy = vi.fn().mockImplementation(async () => {
            return new Response(JSON.stringify({ choices: [{ message: { content: 'Real AI Response' } }] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        vi.stubGlobal('fetch', nativeFetchSpy);

        // Clear IndexedDB
        await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase('quota-guard-cache');
            req.onsuccess = resolve;
            req.onerror = resolve;
        });

        await injectQuotaGuard({
            enabled: true,
            aiEndpoints: ['api.openai.com'],
            debounceMs: 0
        });
    });

    afterEach(() => {
        removeGlobalGuards();
        vi.unstubAllGlobals();
    });

    it('intercepts window.fetch and caches the response in IndexedDB', async () => {
        const url = 'https://api.openai.com/v1/chat/completions';
        const body = JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] });

        // First call - should hit the network (mocked)
        const res1 = await window.fetch(url, { method: 'POST', body });
        const data1 = await res1.json();
        
        expect(nativeFetchSpy).toHaveBeenCalledTimes(1);
        expect(data1.choices[0].message.content).toBe('Real AI Response');

        // Second call - should hit the cache (IndexedDB)
        const res2 = await window.fetch(url, { method: 'POST', body });
        const data2 = await res2.json();

        expect(nativeFetchSpy).toHaveBeenCalledTimes(1); // Still 1!
        expect(data2.choices[0].message.content).toBe('Real AI Response');
    });

    it('deduplicates parallel fetch requests', async () => {
        const url = 'https://api.openai.com/v1/chat/completions';
        const body = JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'parallel' }] });

        // Fire 3 parallel requests
        const [r1, r2, r3] = await Promise.all([
            window.fetch(url, { method: 'POST', body }),
            window.fetch(url, { method: 'POST', body }),
            window.fetch(url, { method: 'POST', body })
        ]);

        expect(nativeFetchSpy).toHaveBeenCalledTimes(1);
        
        const d1 = await r1.json();
        const d2 = await r2.json();
        const d3 = await r3.json();

        expect(d1.choices[0].message.content).toBe('Real AI Response');
        expect(d2.choices[0].message.content).toBe('Real AI Response');
        expect(d3.choices[0].message.content).toBe('Real AI Response');
    });
});
