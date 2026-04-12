import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { injectQuotaGuard } from '../../src/setup';
import { getConfig, setConfig } from '../../src/config';

describe('Configuration Priority (Exhaustive 6-Level Hierarchy)', () => {
    let sandboxDir: string;

    beforeEach(() => {
        sandboxDir = mkdtempSync(join(tmpdir(), 'quota-priority-exhaustive-'));
        // Mock process.cwd() and NODE_ENV
        vi.stubGlobal('process', {
            ...process,
            cwd: () => sandboxDir,
            versions: { ...process.versions, node: '20.0.0' },
            env: { ...process.env, NODE_ENV: 'test', QUOTA_GUARD_CONFIG: '' }
        });
        // Clear global window config
        if (typeof window !== 'undefined') {
            // @ts-expect-error - testing global config
            delete window.__QUOTA_GUARD_CONFIG__;
        } else {
            vi.stubGlobal('window', {});
        }
        setConfig({});
    });

    afterEach(() => {
        if (existsSync(sandboxDir)) {
            rmSync(sandboxDir, { recursive: true, force: true });
        }
        vi.unstubAllGlobals();
    });

    const writeConfig = (name: string, content: unknown) => {
        const fullPath = join(sandboxDir, name);
        const dir = join(fullPath, '..');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, JSON.stringify(content));
    };

    it('FULL PRIORITY CHAIN: L1 > L2 > L3 > L4 > L5 > L6', async () => {
        // L1: Code/Plugin
        // L2: Env Var JSON
        // L3: Env-specific File
        // L4: Base File
        // L5: Window Global
        // L6: Defaults
        
        const setupAll = async () => {
            // L2: Env Var JSON (Level 2)
            vi.stubGlobal('process', {
                ...process,
                env: { ...process.env, QUOTA_GUARD_CONFIG: JSON.stringify({ debounceMs: 150 }) }
            });
            // L3: Env File (Level 3)
            writeConfig('.quotaguardrc.test.json', { debounceMs: 200 });
            // L4: Base File (Level 4)
            writeConfig('.quotaguardrc.json', { debounceMs: 300 });
            // L5: Window Global (Level 5)
            // @ts-expect-error - testing global config
            window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 500 };
        };

        // Scenario 1: All layers present -> L1 wins (100)
        await setupAll();
        await injectQuotaGuard({ debounceMs: 100 });
        expect(getConfig().debounceMs).toBe(100);

        // Scenario 2: L1 missing -> L2 wins (150)
        await injectQuotaGuard({}); 
        expect(getConfig().debounceMs).toBe(150);

        // Scenario 3: L1, L2 missing -> L3 wins (200)
        vi.stubGlobal('process', {
            ...process,
            env: { ...process.env, QUOTA_GUARD_CONFIG: '' }
        });
        await injectQuotaGuard({});
        expect(getConfig().debounceMs).toBe(200);

        // Scenario 4: L1, L2, L3 missing -> L4 wins (300)
        rmSync(join(sandboxDir, '.quotaguardrc.test.json'));
        await injectQuotaGuard({});
        expect(getConfig().debounceMs).toBe(300);

        // Scenario 5: L1, L2, L3, L4 missing -> L5 (Window) wins (500)
        rmSync(join(sandboxDir, '.quotaguardrc.json'));
        await injectQuotaGuard({});
        expect(getConfig().debounceMs).toBe(500); 

        // Scenario 6: Pure fallback -> L6 (Default) wins (300)
        // @ts-expect-error - reset window
        delete window.__QUOTA_GUARD_CONFIG__;
        await injectQuotaGuard({});
        expect(getConfig().debounceMs).toBe(300);
    });

    it('DEEP MERGE: Objects are merged across layers', async () => {
        // L1: Plugin
        const l1 = { rules: [{ match: { url: 'l1' } }] };
        // L2: Env JSON
        vi.stubGlobal('process', {
            ...process,
            env: { ...process.env, QUOTA_GUARD_CONFIG: JSON.stringify({ breakerMaxFailures: 22 }) }
        });
        // L3: Env File
        writeConfig('.quotaguardrc.test.json', { cacheCheckIntervalMs: 44 });
        // L4: Base
        writeConfig('.quotaguardrc.json', { cacheTtlMs: 33 });
        // L5: Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { enabled: false };

        await injectQuotaGuard(l1);

        const config = getConfig();
        expect(config.rules![0].match.url).toBe('l1'); // From L1
        expect(config.breakerMaxFailures).toBe(22); // From L2
        expect(config.cacheTtlMs).toBe(33); // From L4 (Base)
        expect(config.enabled).toBe(false); // From L5 (Window) wins over L6 (Default:true)
    });
});
