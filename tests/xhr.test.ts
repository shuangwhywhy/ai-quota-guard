/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { injectQuotaGuard, unhookFetch } from '../src/index';

describe('XMLHttpRequest Interception', () => {
    beforeEach(() => {
        // Mock global fetch for handleRequest
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            return new Response(JSON.stringify({ choices: [{ message: { content: 'Hello from mock fetch' } }] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        
        injectQuotaGuard({
            enabled: true,
            aiEndpoints: ['api.openai.com'],
            cacheTtlMs: 1000,
            debounceMs: 0
        });
    });

    afterEach(() => {
        unhookFetch();
        vi.restoreAllMocks();
    });

    it('should intercept XMLHttpRequest and redirect to handleRequest (Cache Hit)', async () => {
        const responseData = { choices: [{ message: { content: 'Hello from cache' } }] };
        const body = JSON.stringify({ model: 'gpt-4', messages: [] });
        
        // Pre-warm the cache to avoid any network calls
        injectQuotaGuard({
            enabled: true,
            aiEndpoints: ['api.openai.com'],
            cacheKeyStrategy: 'intelligent'
        });
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://api.openai.com/v1/chat/completions');
        
        const responsePromise = new Promise((resolve, reject) => {
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error('XHR error'));
            setTimeout(() => reject(new Error('Timeout')), 2000);
        });

        // Trigger the guard once to seed the cache (via fetch which we already mocked)
        await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            body
        });

        // Now call via XHR
        xhr.send(body);

        const responseText = await responsePromise;
        const data = JSON.parse(responseText as string);

        expect(data.choices[0].message.content).toBe('Hello from mock fetch');
        expect(xhr.status).toBe(200);
    });
});
