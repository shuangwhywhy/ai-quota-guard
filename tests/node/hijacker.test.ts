/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { RuntimeHijacker } from '../../src/utils/hijacker.js';
import { setConfig, ConfigSource } from '../../src/config.js';

describe('RuntimeHijacker', () => {
    let originalCreateServer: any;

    beforeEach(() => {
        originalCreateServer = http.createServer;
        RuntimeHijacker.__reset();
        setConfig({ enabled: true }, ConfigSource.Manual);
    });

    afterEach(() => {
        http.createServer = originalCreateServer;
        vi.restoreAllMocks();
    });

    it('patches http.createServer and injects into HTML responses', async () => {
        // 1. Arrange: Capture the listener that would be passed to the original createServer
        let capturedWrappedListener: any;
        const mockServer = { 
            listen: vi.fn(), 
            on: vi.fn() 
        };
        
        // Mock the core http.createServer to capture what the hijacker sends to it
        vi.spyOn(http, 'createServer').mockImplementation(((arg1: any, arg2: any) => {
            capturedWrappedListener = typeof arg1 === 'function' ? arg1 : arg2;
            return mockServer;
        }) as any);

        // 2. Act: Apply the hijacker and "create" a server
        RuntimeHijacker.apply();
        http.createServer((req: any, res: any) => {
            res.setHeader('Content-Type', 'text/html');
            res.end('<html><head></head><body>Hello</body></html>');
        });

        // 3. Assert: Verify the wrapper was created and can process a request
        expect(capturedWrappedListener).toBeDefined();

        const mockReq = { url: '/' };
        let resultBody = '';
        const mockRes = {
            _headers: {} as Record<string, string>,
            setHeader(k: string, v: string) { this._headers[k.toLowerCase()] = v; },
            getHeader(k: string) { return this._headers[k.toLowerCase()]; },
            write: vi.fn(),
            end(chunk: string) { resultBody = chunk; }
        };

        // Execute the hijack wrapper
        await capturedWrappedListener(mockReq, mockRes);

        expect(resultBody).toContain('Quota Guard Zero-Intrusion Bridge');
        expect(resultBody).toContain('register.js');
        expect(resultBody).toContain('</head>');
    });

    it('correctly updates content-length when injecting', async () => {
        let capturedWrappedListener: any;
        vi.spyOn(http, 'createServer').mockImplementation(((arg1: any, arg2: any) => {
            capturedWrappedListener = typeof arg1 === 'function' ? arg1 : arg2;
            return {};
        }) as any);

        RuntimeHijacker.apply();
        http.createServer((req: any, res: any) => {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Content-Length', '10');
            res.end('1234567890');
        });

        const mockReq = { url: '/' };
        const mockRes = {
            _headers: { 'content-type': 'text/html', 'content-length': '10' } as Record<string, any>,
            setHeader(k: string, v: any) { this._headers[k.toLowerCase()] = v; },
            getHeader(k: string) { return this._headers[k.toLowerCase()]; },
            write: vi.fn(),
            end: vi.fn()
        };

        await capturedWrappedListener(mockReq, mockRes);
        
        const newLen = parseInt(mockRes._headers['content-length'], 10);
        expect(newLen).toBeGreaterThan(10);
    });

    it('does not inject into non-HTML responses', async () => {
        let capturedWrappedListener: any;
        vi.spyOn(http, 'createServer').mockImplementation(((arg1: any, arg2: any) => {
            capturedWrappedListener = typeof arg1 === 'function' ? arg1 : arg2;
            return {};
        }) as any);

        RuntimeHijacker.apply();
        http.createServer((req: any, res: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.end('{"ok":true}');
        });

        const mockReq = { url: '/' };
        let resultBody = '';
        const mockRes = {
            _headers: { 'content-type': 'application/json' } as Record<string, any>,
            setHeader(k: string, v: any) { this._headers[k.toLowerCase()] = v; },
            getHeader(k: string) { return this._headers[k.toLowerCase()]; },
            write: vi.fn(),
            end(chunk: string) { resultBody = chunk; }
        };

        await capturedWrappedListener(mockReq, mockRes);
        expect(resultBody).toBe('{"ok":true}');
        expect(resultBody).not.toContain('Quota Guard');
    });
});
