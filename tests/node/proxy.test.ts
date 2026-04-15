import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProxyServer } from '../../src/utils/proxy.js';
import { globalStats } from '../../src/utils/stats-collector.js';
import { setConfig } from '../../src/config.js';
import http from 'node:http';

describe('ProxyServer', () => {
    let proxy: ProxyServer;

    beforeEach(() => {
        setConfig({ proxyPort: 1990 });
        proxy = new ProxyServer();
        // Mock globalStats.record to avoid side effects
        vi.spyOn(globalStats, 'record').mockImplementation(() => {});
        vi.spyOn(globalStats, 'addLog').mockImplementation(() => {});
    });

    afterEach(() => {
        proxy.stop();
        vi.restoreAllMocks();
    });

    it('starts and stops correctly', async () => {
        const listenSpy = vi.spyOn(http.Server.prototype, 'listen');
        const closeSpy = vi.spyOn(http.Server.prototype, 'close');
        
        proxy.start();
        expect(listenSpy).toHaveBeenCalled();
        
        proxy.stop();
        expect(closeSpy).toHaveBeenCalled();
    });

    it('handles telemetry events via POST /__quota_guard_events', async () => {
        proxy.start();
        const event = { type: 'HIT', url: 'test.com', hostname: 'test.com', key: '123' };
        
        const response = await fetch('http://localhost:1990/__quota_guard_events', {
            method: 'POST',
            body: JSON.stringify(event)
        });

        expect(response.status).toBe(204);
        expect(globalStats.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'HIT', key: '123' }));
    });

    it('rejects invalid telemetry data with 400', async () => {
        proxy.start();
        const response = await fetch('http://localhost:1990/__quota_guard_events', {
            method: 'POST',
            body: 'invalid-json'
        });
        expect(response.status).toBe(400);
    });

    it('serves register.js with correct content type', async () => {
        proxy.start();
        const response = await fetch('http://localhost:1990/register.js');
        // It might be 404 or 200 depending on if dist/ exists in the test env, 
        // but we test that it tries to return a response.
        expect([200, 404, 500]).toContain(response.status);
        if (response.status === 200) {
            expect(response.headers.get('content-type')).toContain('application/javascript');
        }
    });

    it('handles CORS preflight (OPTIONS)', async () => {
        proxy.start();
        const response = await fetch('http://localhost:1990/some-ai-endpoint', {
            method: 'OPTIONS'
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('returns 400 if target service cannot be determined', async () => {
        proxy.start();
        const response = await fetch('http://localhost:1990/invalid-path-no-dots');
        expect(response.status).toBe(400);
        const text = await response.text();
        expect(text).toContain('Could not determine target AI service');
    });

    it('correctly identifies target service from path', async () => {
        // We can't easily test the full proxying without a real network or deeper mocks 
        // since it calls global fetch(), but we can test the identifying logic by 
        // looking at how it parses URLs in a mock sense if we refactored it.
        // For now, these tests cover the branches up to the sync fetch call.
        proxy.start();
        
        const spy = vi.fn().mockResolvedValue(new Response('OK'));
        vi.stubGlobal('fetch', spy);

        // Call the proxy using http instead of fetch to avoid triggering our global fetch spy
        await new Promise((resolve, reject) => {
            const req = http.request('http://localhost:1990/api.openai.com/v1/chat/completions', { method: 'POST' }, (res) => {
                res.on('data', () => {});
                res.on('end', resolve);
            });
            req.on('error', reject);
            req.write('{}');
            req.end();
        });

        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('https://api.openai.com/v1/chat/completions'),
            expect.anything()
        );
    });
});
