import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import { RuntimeHijacker } from '../../src/utils/hijacker.js';

describe('RuntimeHijacker', () => {
    afterEach(() => {
        RuntimeHijacker.__reset();
        vi.restoreAllMocks();
    });

    it('patches http.createServer correctly', () => {
        const original = http.createServer;
        RuntimeHijacker.apply();
        expect(http.createServer).not.toBe(original);
        
        // Test idempotency
        const patched = http.createServer;
        RuntimeHijacker.apply();
        expect(http.createServer).toBe(patched);
        
        http.createServer = original;
    });

    it('hijacks response for HTML injection', () => {
        const originalEnd = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            getHeader: vi.fn(),
            write: vi.fn(),
            end: originalEnd,
            writeHead: vi.fn()
        };

        // Directly test the extracted logic
        RuntimeHijacker.hijackResponse(mockRes as unknown as http.ServerResponse);

        // 1. Trigger HTML detection via setHeader
        mockRes.setHeader('Content-Type', 'text/html');
        
        // 2. Simulate fragmented write
        mockRes.write('<html><head></head>');
        mockRes.write('<body>');
        mockRes.end('</body></html>');

        // 3. Verify injection in final end call
        expect(originalEnd).toHaveBeenCalled();
        const finalOutput = String(originalEnd.mock.calls[0][0]);
        expect(finalOutput).toContain('Quota Guard');
        expect(finalOutput).toContain('window.__QUOTA_GUARD_ENABLED__');
    });

    it('handles writeHead with headers object', () => {
        const originalEnd = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            getHeader: vi.fn(),
            write: vi.fn(),
            end: originalEnd,
            writeHead: vi.fn()
        };

        RuntimeHijacker.hijackResponse(mockRes as unknown as http.ServerResponse);

        // Trigger via writeHead
        mockRes.writeHead(200, { 'Content-Type': 'text/html' });
        mockRes.write('<html><body></body></html>');
        mockRes.end('');

        expect(originalEnd).toHaveBeenCalled();
        const finalOutput = String(originalEnd.mock.calls[0][0]);
        expect(finalOutput).toContain('Quota Guard');
    });

    it('skips non-HTML responses', () => {
        const originalEnd = vi.fn();
        const originalWrite = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            getHeader: vi.fn(),
            write: originalWrite,
            end: originalEnd,
            writeHead: vi.fn()
        };

        RuntimeHijacker.hijackResponse(mockRes as unknown as http.ServerResponse);

        mockRes.setHeader('Content-Type', 'application/json');
        
        // When NOT HTML, write and end should pass through
        mockRes.write('{"ok":true}');
        mockRes.end('}');

        expect(originalWrite).toHaveBeenCalled();
        expect(originalEnd).toHaveBeenCalled();
        
        // Check that any call contains the data
        const writeCall = originalWrite.mock.calls.some(c => String(c[0]).includes('ok'));
        const endCall = originalEnd.mock.calls.some(c => String(c[0]).includes('}'));
        
        expect(writeCall).toBe(true);
        expect(endCall).toBe(true);
    });

    it('supports injection into fragmented responses without tags', () => {
        const originalEnd = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            getHeader: vi.fn(),
            write: vi.fn(),
            end: originalEnd,
            writeHead: vi.fn()
        };

        RuntimeHijacker.hijackResponse(mockRes as unknown as http.ServerResponse);

        mockRes.setHeader('Content-Type', 'text/html');
        // No body tag
        mockRes.end('Hello');

        expect(originalEnd).toHaveBeenCalled();
        const finalOutput = String(originalEnd.mock.calls[0][0]);
        expect(finalOutput).toContain('Quota Guard');
        expect(finalOutput).toContain('Hello');
    });

    it('handles writeHead with reasonPhrase correctly', () => {
        const originalEnd = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            getHeader: vi.fn(),
            write: vi.fn(),
            end: originalEnd,
            writeHead: vi.fn(),
            headersSent: false
        };

        RuntimeHijacker.hijackResponse(mockRes as unknown as http.ServerResponse);

        // writeHead(statusCode, reasonPhrase, headers)
        mockRes.writeHead(200, 'OK', { 'Content-Type': 'text/html' });
        mockRes.write('<html><body></body></html>');
        mockRes.end();

        expect(originalEnd).toHaveBeenCalled();
        const finalOutput = String(originalEnd.mock.calls[0][0]);
        expect(finalOutput).toContain('Quota Guard');
    });

    it('returns early in writeHead if headersSent is true', () => {
        const originalWriteHead = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            getHeader: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            writeHead: originalWriteHead,
            headersSent: true
        };

        RuntimeHijacker.hijackResponse(mockRes as unknown as http.ServerResponse);
        
        const result = mockRes.writeHead(200);
        expect(result).toBe(mockRes);
        expect(originalWriteHead).not.toHaveBeenCalled();
    });
});
