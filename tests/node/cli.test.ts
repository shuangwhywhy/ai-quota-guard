import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pkg from '../../package.json';
import { main } from '../../src/cli.js';
import { loadQuotaGuardConfig } from '../../src/loader.js';

vi.mock('node:fs', async () => {
    const actual = await vi.importActual('node:fs') as typeof fs;
    return {
        default: {
            ...actual,
            existsSync: vi.fn(),
            writeFileSync: vi.fn(),
            // Provide a default for the top-level readFileSync in src/cli.ts
            readFileSync: vi.fn((pathStr: string) => {
                if (pathStr.endsWith('package.json')) {
                    return JSON.stringify({ version: pkg.version });
                }
                return actual.readFileSync(pathStr);
            }),
        }
    };
});

vi.mock('node:child_process', () => ({
    spawn: vi.fn(() => ({
        on: vi.fn(),
    })),
}));

vi.mock('../../src/loader.js', async () => {
    const actual = await vi.importActual('../../src/loader.js') as object;
    return {
        ...actual,
        loadQuotaGuardConfig: vi.fn().mockResolvedValue({
            base: { enabled: true },
            specific: { cacheTtlMs: 5000 }
        }),
    };
});

describe('Quota Guard CLI', () => {
    const originalExit = process.exit;
    const originalLog = console.log;
    const originalError = console.error;

    let mockExit: Mock;
    let mockLog: Mock;
    let mockError: Mock;

    beforeEach(() => {
        mockExit = vi.fn() as unknown as Mock;
        mockLog = vi.fn();
        mockError = vi.fn();
        // @ts-expect-error - mockExit is a Mock, but process.exit expects a specific function signature
        process.exit = mockExit;
        console.log = mockLog;
        console.error = mockError;
        
        // Mock readFileSync for package.json (needed for pkg.version)
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: pkg.version }));
    });

    afterEach(() => {
        process.exit = originalExit;
        console.log = originalLog;
        console.error = originalError;
        vi.clearAllMocks();
    });

    it('shows help when no arguments provided', async () => {
        await main([]);
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('AI Quota Guard CLI'));
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('shows help with help command', async () => {
        await main(['help']);
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('shows version', async () => {
        await main(['version']);
        expect(mockLog).toHaveBeenCalledWith(`v${pkg.version}`);
    });

    it('aborts init if file exists', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        await main(['init']);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('successfully initializes config', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        await main(['init'], '/tmp-test');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join('/tmp-test', '.quotaguardrc.ts'),
            expect.stringContaining('defineConfig'),
            'utf8'
        );
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });

    it('throws write errors during init', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.writeFileSync).mockImplementation(() => {
            throw new Error('Disk full');
        });
        await expect(main(['init'])).rejects.toThrow('Disk full');
    });

    it('warns about unknown commands', async () => {
        await main(['invalid-cmd']);
        expect(mockError).toHaveBeenCalledWith('Unknown command: invalid-cmd');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    describe('run command', () => {
        it('aborts run if no command provided', async () => {
            await main(['run']);
            expect(mockError).toHaveBeenCalledWith(expect.stringContaining('No command provided'));
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it('successfully spawns child process with injected flags and config', async () => {
            const mockSpawn = vi.mocked(spawn);
            await main(['run', 'node', 'app.js']);

            expect(loadQuotaGuardConfig).toHaveBeenCalled();
            expect(mockSpawn).toHaveBeenCalled();

            const [cmd, args, options] = mockSpawn.mock.calls[0];
            expect(cmd).toBe('node');
            expect(args).toEqual(['app.js']);
            
            // Check Env Var
            expect(options.env.QUOTA_GUARD_CONFIG).toContain('"enabled":true');
            expect(options.env.QUOTA_GUARD_CONFIG).toContain('"cacheTtlMs":5000');
            
            // Check NODE_OPTIONS
            expect(options.env.NODE_OPTIONS).toContain('@shuangwhywhy/quota-guard/register');
            expect(options.env.NODE_OPTIONS).toMatch(/--import|--loader/);
            
            expect(options.stdio).toBe('inherit');
            expect(options.shell).toBe(true);
        });

        it('presets NODE_OPTIONS if they already exist', async () => {
            const mockSpawn = vi.mocked(spawn);
            process.env.NODE_OPTIONS = '--max-old-space-size=4096';
            
            await main(['run', 'node', 'app.js']);
            
            const options = mockSpawn.mock.calls[0][2];
            expect(options.env.NODE_OPTIONS).toContain('--max-old-space-size=4096');
            expect(options.env.NODE_OPTIONS).toContain('@shuangwhywhy/quota-guard/register');
            
            delete process.env.NODE_OPTIONS;
        });

        it('uses --import for modern Node versions (>= 20.6.0)', async () => {
            const mockSpawn = vi.mocked(spawn);
            vi.stubGlobal('process', { ...process, versions: { ...process.versions, node: '20.6.0' } });
            
            await main(['run', 'node', 'app.js']);
            
            const options = mockSpawn.mock.calls[0][2];
            expect(options.env.NODE_OPTIONS).toContain('--import');
            
            vi.unstubAllGlobals();
        });

        it('uses --loader for older Node versions (< 20.6.0)', async () => {
            const mockSpawn = vi.mocked(spawn);
            vi.stubGlobal('process', { ...process, versions: { ...process.versions, node: '18.15.0' } });
            
            await main(['run', 'node', 'app.js']);
            
            const options = mockSpawn.mock.calls[0][2];
            expect(options.env.NODE_OPTIONS).toContain('--loader');
            
            vi.unstubAllGlobals();
        });

        it('forwards exit code from child processsink', async () => {
            const mockExitEvent = vi.fn();
            const mockChild = { on: mockExitEvent };
            // @ts-expect-error - mockChild is a minimal mock of ChildProcess
            vi.mocked(spawn).mockReturnValue(mockChild);

            await main(['run', 'node', 'app.js']);

            expect(mockExitEvent).toHaveBeenCalledWith('exit', expect.any(Function));
            
            // Trigger exit
            const exitHandler = mockExitEvent.mock.calls[0][1];
            exitHandler(42);
            expect(mockExit).toHaveBeenCalledWith(42);
        });
    });

    it('handles thrown errors in catch block via isMain branch', async () => {
        // Mock fs.writeFileSync to throw so that main() fails without an internal try-catch
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.writeFileSync).mockImplementation(() => {
            throw new Error('Disk full');
        });

        const mockArgv = [...process.argv];
        mockArgv[1] = 'cli.ts';
        mockArgv[2] = 'init'; 
        
        vi.stubGlobal('process', {
            ...process,
            argv: mockArgv,
            exit: mockExit,
        });

        // Clear module cache to re-run top-level code
        vi.resetModules();
        await import('../../src/cli.js');

        // Wait for the async catch block to execute
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockError).toHaveBeenCalledWith(expect.any(Error));
        expect(mockExit).toHaveBeenCalledWith(1);
        vi.unstubAllGlobals();
    });
});
