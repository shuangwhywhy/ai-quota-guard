import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pkg from '../../package.json';
import { main } from '../../src/cli.js';
import { loadQuotaGuardConfig } from '../../src/loader.js';

// Get original fs to avoid recursion in spies
const actualFs = await vi.importActual('node:fs') as typeof fs;

// We mock the loader to avoid hitting the actual filesystem for config during tests
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

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
    spawn: vi.fn(() => ({
        on: vi.fn(),
    })),
}));

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
        // @ts-expect-error - mockExit is a Mock
        process.exit = mockExit;
        console.log = mockLog;
        console.error = mockError;

        // Use transparent spies to avoid breaking Vitest internal file resolution
        vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
            // Default behavior for CLI tests: config doesn't exist
            if (p.toString().includes('.quotaguardrc.ts')) return false;
            return actualFs.existsSync(p);
        });
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
            if (p.toString().endsWith('package.json')) {
                return JSON.stringify({ version: pkg.version });
            }
            return actualFs.readFileSync(p);
        });
    });

    afterEach(() => {
        process.exit = originalExit;
        console.log = originalLog;
        console.error = originalError;
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('shows help when no arguments provided', async () => {
        await main([]);
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('AI Quota Guard CLI'));
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('implicit run'));
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
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        await main(['init']);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('successfully initializes config', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        await main(['init'], '/tmp-test');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join('/tmp-test', '.quotaguardrc.ts'),
            expect.stringContaining('api.openai.com'),
            'utf8'
        );
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });

    it('successfully initializes config with environment', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        await main(['init', 'dev'], '/tmp-test');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join('/tmp-test', '.quotaguardrc.dev.ts'),
            expect.stringContaining('api.openai.com'),
            'utf8'
        );
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });

    it('throws write errors during init', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
            throw new Error('Disk full');
        });
        await expect(main(['init'])).rejects.toThrow('Disk full');
    });

    it('defaults to implicit run for unknown commands', async () => {
        const mockSpawn = vi.mocked(spawn);
        await main(['node', 'app.js']);
        expect(mockSpawn).toHaveBeenCalled();
        const [cmd, args] = mockSpawn.mock.calls[0];
        expect(cmd).toBe('node');
        expect(args).toEqual(['app.js']);
        expect(loadQuotaGuardConfig).toHaveBeenCalled();
    });

    describe('run command and execution paths', () => {
        it('aborts explicit run if no command provided', async () => {
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
            
            // Re-asserting all original details
            expect(options.env.QUOTA_GUARD_CONFIG).toContain('"enabled":true');
            expect(options.env.QUOTA_GUARD_CONFIG).toContain('"cacheTtlMs":5000');
            
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

        it('implicit run: successfully spawns unrecognized command', async () => {
            const mockSpawn = vi.mocked(spawn);
            await main(['node', 'script.js']);

            expect(loadQuotaGuardConfig).toHaveBeenCalled();
            expect(mockSpawn).toHaveBeenCalled();
            const [cmd, args] = mockSpawn.mock.calls[0];
            expect(cmd).toBe('node');
            expect(args).toEqual(['script.js']);
        });

        it('implicit run: handles complex arguments and flags', async () => {
            const mockSpawn = vi.mocked(spawn);
            await main(['node', 'app.js', '--port', '3000', '--debug']);

            expect(mockSpawn).toHaveBeenCalled();
            const [cmd, args] = mockSpawn.mock.calls[0];
            expect(cmd).toBe('node');
            expect(args).toEqual(['app.js', '--port', '3000', '--debug']);
        });

        it('delimiter support: runs command after --', async () => {
            const mockSpawn = vi.mocked(spawn);
            await main(['--', 'node', 'test.js']);

            expect(loadQuotaGuardConfig).toHaveBeenCalled();
            expect(mockSpawn).toHaveBeenCalled();
            const [cmd, args] = mockSpawn.mock.calls[0];
            expect(cmd).toBe('node');
            expect(args).toEqual(['test.js']);
        });

        it('script detection: automatically prepends npm run if in package.json', async () => {
            const mockSpawn = vi.mocked(spawn);
            
            vi.spyOn(fs, 'existsSync').mockImplementation((p) => p.toString().endsWith('package.json'));
            vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
                if (p.toString().endsWith('package.json')) {
                    return JSON.stringify({ scripts: { dev: 'vite' } });
                }
                return '';
            });

            await main(['dev', '--port', '8080']);

            expect(loadQuotaGuardConfig).toHaveBeenCalled();
            expect(mockSpawn).toHaveBeenCalled();
            const [cmd, args] = mockSpawn.mock.calls[0];
            expect(cmd).toBe('npm');
            expect(args).toEqual(['run', 'dev', '--port', '8080']);
        });

        it('forwards exit code from child processsink', async () => {
            const mockExitEvent = vi.fn();
            const mockChild = { on: mockExitEvent };
            // @ts-expect-error - mockChild is a minimal mock
            vi.mocked(spawn).mockReturnValue(mockChild);

            await main(['run', 'node', 'app.js']);

            expect(mockExitEvent).toHaveBeenCalledWith('exit', expect.any(Function));
            
            // Trigger exit
            const exitHandler = mockExitEvent.mock.calls[0][1];
            exitHandler(42);
            expect(mockExit).toHaveBeenCalledWith(42);
        });

        describe('CLI Flags', () => {
            it('supports --dashboard flag', async () => {
                const mockSpawn = vi.mocked(spawn);
                await main(['--dashboard', 'node', 'app.js']);

                expect(mockSpawn).toHaveBeenCalled();
                const [cmd, args, options] = mockSpawn.mock.calls[0];
                expect(cmd).toBe('node');
                expect(args).toEqual(['app.js']);
                expect(options.env.QUOTA_GUARD_CONFIG).toContain('"showDashboard":true');
            });

            it('supports --no-dashboard flag', async () => {
                const mockSpawn = vi.mocked(spawn);
                await main(['--no-dashboard', 'node', 'app.js']);

                expect(mockSpawn).toHaveBeenCalled();
                const [cmd, args, options] = mockSpawn.mock.calls[0];
                expect(cmd).toBe('node');
                expect(args).toEqual(['app.js']);
                expect(options.env.QUOTA_GUARD_CONFIG).toContain('"showDashboard":false');
            });

            it('supports mixed flags and command arguments', async () => {
                const mockSpawn = vi.mocked(spawn);
                await main(['--dashboard', 'node', 'app.js', '--port', '3000']);

                const [cmd, args, options] = mockSpawn.mock.calls[0];
                expect(cmd).toBe('node');
                expect(args).toEqual(['app.js', '--port', '3000']);
                expect(options.env.QUOTA_GUARD_CONFIG).toContain('"showDashboard":true');
            });

            it('stops parsing QG flags at first non-flag argument', async () => {
                const mockSpawn = vi.mocked(spawn);
                // Here --dashboard is an argument for node, not for qg
                await main(['node', '--dashboard', 'app.js']);

                const [cmd, args, options] = mockSpawn.mock.calls[0];
                expect(cmd).toBe('node');
                expect(args).toEqual(['--dashboard', 'app.js']);
                // Default is false
                expect(options.env.QUOTA_GUARD_CONFIG).toContain('"showDashboard":false');
            });

            it('supports -- delimiter to stop parsing flags', async () => {
                const mockSpawn = vi.mocked(spawn);
                // Here --dashboard is protected by --
                await main(['--', '--dashboard', 'node', 'app.js']);

                const [cmd, args, options] = mockSpawn.mock.calls[0];
                expect(cmd).toBe('--dashboard');
                expect(args).toEqual(['node', 'app.js']);
                expect(options.env.QUOTA_GUARD_CONFIG).toContain('"showDashboard":false');
            });
        });
    });

    it('handles thrown errors in catch block via isMain branch', async () => {
        // Mock fs.writeFileSync to throw so that main() fails
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
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

        // Clear module cache and re-import to run top-level code
        vi.resetModules();
        await import('../../src/cli.js');

        // Wait for the async catch block to execute
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockError).toHaveBeenCalledWith(expect.any(Error));
        expect(mockExit).toHaveBeenCalledWith(1);
        vi.unstubAllGlobals();
    });
});
