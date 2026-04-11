import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectQuotaGuard, unhookFetch } from '../../src/index';

describe('Streaming Interception (Browser)', { browser: true }, () => {
    let nativeFetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        nativeFetchSpy = vi.fn().mockImplementation(async () => {
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode('data: {"text":"Hello"}\n\n'));
                    controller.enqueue(encoder.encode('data: {"text":"World"}\n\n'));
                    controller.close();
                }
            });

            return new Response(stream, {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' }
            });
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
            aiEndpoints: ['api.openai.com'],
            debounceMs: 0
        });
    });

    afterEach(() => {
        unhookFetch();
        vi.unstubAllGlobals();
    });

    it('successfully streams responses and caches the final result', async () => {
        const url = 'https://api.openai.com/v1/chat/completions';
        
        // 1. Initial streaming call
        const res1 = await window.fetch(url, { method: 'POST', body: '{}' });
        const reader = res1.body?.getReader();
        const decoder = new TextDecoder();
        
        let content = '';
        while (true) {
            const { value, done } = await reader!.read();
            if (done) break;
            content += decoder.decode(value);
        }

        expect(content).toContain('Hello');
        expect(content).toContain('World');
        expect(nativeFetchSpy).toHaveBeenCalledTimes(1);

        // 2. Second call should hit the cache (non-streaming, as we cache the buffer)
        // Wait a bit for the background cache-write to complete
        await new Promise(r => setTimeout(r, 50));

        const res2 = await window.fetch(url, { method: 'POST', body: '{}' });
        const text2 = await res2.text();
        
        expect(text2).toBe(content);
        expect(nativeFetchSpy).toHaveBeenCalledTimes(1);
    });
});
