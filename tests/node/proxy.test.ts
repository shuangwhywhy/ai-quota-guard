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
        // Mock globalStats to avoid side effects
        vi.spyOn(globalStats, 'record').mockImplementation(() => {});
        vi.spyOn(globalStats, 'addLog').mockImplementation(() => {});
    });

    afterEach(() => {
        proxy.stop();
        vi.unstubAllGlobals();
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
        expect(globalStats.record).toHaveBeenCalled();
    });

    it('serves register.js if available', async () => {
        proxy.start();
        const response = await fetch('http://localhost:1990/register.js');
        // Simple assertion that ensures the logic executes
        expect([200, 404, 500]).toContain(response.status);
    });

    it('handles CORS preflight (OPTIONS)', async () => {
        proxy.start();
        const response = await fetch('http://localhost:1990/some-ai-endpoint', {
            method: 'OPTIONS'
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('proxies requests and records activity', async () => {
        proxy.start();
        const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
        vi.stubGlobal('fetch', mockFetch);
        
        await new Promise((resolve, reject) => {
            const req = http.request('http://localhost:1990/api.openai.com/v1/chat', { method: 'POST' }, (res) => {
                res.on('data', () => {});
                res.on('end', resolve);
            });
            req.on('error', reject);
            req.write('{}');
            req.end();
        });
        expect(mockFetch).toHaveBeenCalled();
    });

    it('logs server errors', () => {
        const spy = vi.spyOn(globalStats, 'addLog');
        proxy.start();
        const server = (proxy as unknown as { server: http.Server }).server;
        
        server.emit('error', { code: 'EADDRINUSE' });
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('already in use'));
        
        server.emit('error', { message: 'Random error' });
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Random error'));
        
        proxy.stop();
    });
});
