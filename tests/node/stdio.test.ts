/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stdioManager } from '../../src/utils/stdio.js';
import { globalStats } from '../../src/utils/stats-collector.js';

describe('StdioManager', () => {
    let originalStdoutWrite: any;
    let originalStderrWrite: any;

    beforeEach(() => {
        // Ensure we store the state BEFORE each test
        originalStdoutWrite = process.stdout.write;
        originalStderrWrite = process.stderr.write;
        vi.spyOn(globalStats, 'addLog').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore singleton state and process state
        stdioManager.restore();
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
        vi.restoreAllMocks();
    });

    it('hijacks and restores stdout/stderr', () => {
        stdioManager.hijack();
        expect(process.stdout.write).not.toBe(originalStdoutWrite);
        expect(process.stderr.write).not.toBe(originalStderrWrite);

        stdioManager.restore();
        expect(process.stdout.write).toBe(originalStdoutWrite);
        expect(process.stderr.write).toBe(originalStderrWrite);
    });

    it('is idempotent for hijack', () => {
        stdioManager.hijack();
        const patched = process.stdout.write;
        stdioManager.hijack();
        expect(process.stdout.write).toBe(patched);
    });

    it('handles restore when not hijacked', () => {
        // Should not throw
        stdioManager.restore();
        expect(process.stdout.write).toBe(originalStdoutWrite);
    });

    it('captures stdout and stderr writes', () => {
        stdioManager.hijack();
        
        process.stdout.write('hello stdout');
        expect(globalStats.addLog).toHaveBeenCalledWith('hello stdout');

        process.stderr.write('hello stderr');
        expect(globalStats.addLog).toHaveBeenCalledWith('hello stderr');
    });

    it('handles Uint8Array chunks', () => {
        stdioManager.hijack();
        const chunk = new TextEncoder().encode('binary data');
        process.stdout.write(chunk);
        expect(globalStats.addLog).toHaveBeenCalledWith('binary data');
    });

    it('forwards callbacks correctly', () => {
        // We test that the hijacker correctly passes through arguments
        // We use a manual mock instead of vi.spyOn to avoid Vitest closure recursion
        const realWrite = process.stdout.write;
        let callArgs: any[] = [];
        (process.stdout as any).write = (...args: any[]) => {
            callArgs = args;
            const cb = args[args.length - 1];
            if (typeof cb === 'function') cb();
            return true;
        };

        try {
            stdioManager.hijack();
            let callbackCalled = false;
            process.stdout.write('test', 'utf8', () => {
                callbackCalled = true;
            });

            expect(callbackCalled).toBe(true);
            expect(callArgs[0]).toBe('test');
        } finally {
            process.stdout.write = realWrite;
            stdioManager.restore();
        }
    });

    it('suppresses capture during sync operations', () => {
        stdioManager.hijack();
        stdioManager.suppressCapture(() => {
            process.stdout.write('secret log');
        });
        expect(globalStats.addLog).not.toHaveBeenCalledWith('secret log');
        
        process.stdout.write('public log');
        expect(globalStats.addLog).toHaveBeenCalledWith('public log');
    });

    it('suppresses capture during async operations', async () => {
        stdioManager.hijack();
        await stdioManager.suppressCaptureAsync(async () => {
            process.stdout.write('secret async');
            await new Promise(r => setTimeout(r, 10));
        });
        expect(globalStats.addLog).not.toHaveBeenCalledWith('secret async');

        process.stdout.write('public async');
        expect(globalStats.addLog).toHaveBeenCalledWith('public async');
    });

    it('handles encoding as callback branch', () => {
        const realWrite = process.stdout.write;
        let cbCalled = false;
        (process.stdout as any).write = (_chunk: any, _enc: any, cb: any) => {
            if (typeof cb === 'function') cb();
        };

        try {
            stdioManager.hijack();
            // @ts-expect-error - testing invalid call signature
            process.stdout.write('test', () => { cbCalled = true; });
            expect(cbCalled).toBe(true);
        } finally {
            process.stdout.write = realWrite;
            stdioManager.restore();
        }
    });

    it('handles stderr encoding as callback branch', () => {
        const realStderr = process.stderr.write;
        let cbCalled = false;
        (process.stderr as any).write = (_chunk: any, _enc: any, cb: any) => {
            if (typeof cb === 'function') cb();
        };

        try {
            stdioManager.hijack();
            // @ts-expect-error - testing invalid call signature
            process.stderr.write('test', () => { cbCalled = true; });
            expect(cbCalled).toBe(true);
        } finally {
            process.stderr.write = realStderr;
            stdioManager.restore();
        }
    });

    it('covers singleton branch', () => {
        // Access instance to cover singleton instantiation branch
        const instance = (stdioManager.constructor as any).getInstance();
        expect(instance).toBe(stdioManager);
    });
});
