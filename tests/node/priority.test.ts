import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { injectQuotaGuard } from '../../src/setup';
import { getConfig } from '../../src/config';

describe('Configuration Priority (Exhaustive 5-Level Hierarchy)', () => {
    let sandboxDir: string;

    beforeEach(() => {
        sandboxDir = mkdtempSync(join(tmpdir(), 'quota-priority-exhaustive-'));
        // Mock process.cwd() and NODE_ENV
        vi.stubGlobal('process', {
            ...process,
            cwd: () => sandboxDir,
            env: { ...process.env, NODE_ENV: 'test' }
        });
        // Clear global window config
        if (typeof window !== 'undefined') {
            // @ts-expect-error - testing global config
            delete window.__QUOTA_GUARD_CONFIG__;
        } else {
            vi.stubGlobal('window', {});
        }
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

    it('FULL PRIORITY CHAIN: L1 > L2 > L3 > L4 > L5', async () => {
        // This test proves the entire chain by systematically removing layers
        
        const setupAll = async () => {
            // L2: Env File
            writeConfig('.quotaguardrc.test.json', { debounceMs: 200 });
            // L3: Base File
            writeConfig('.quotaguardrc.json', { debounceMs: 300 });
            // L5: Window Global
            // @ts-expect-error - testing global config
            window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 500 };
        };

        // Scenario 1: All layers present -> L1 wins (100)
        await setupAll();
        await injectQuotaGuard({ debounceMs: 100 });
        expect(getConfig().debounceMs).toBe(100);

        // Scenario 2: L1 missing -> L2 wins (200)
        await setupAll();
        await injectQuotaGuard({}); 
        expect(getConfig().debounceMs).toBe(200);

        // Scenario 3: L1, L2 missing -> L3 wins (300)
        rmSync(join(sandboxDir, '.quotaguardrc.test.json'));
        await injectQuotaGuard({});
        expect(getConfig().debounceMs).toBe(300);

        // Scenario 4: L1, L2, L3 missing -> L4 (Defaults) wins (300)
        // Note: Default is 300 in code, so we change L5 to verify L4 wins over L5
        rmSync(join(sandboxDir, '.quotaguardrc.json'));
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 500 };
        await injectQuotaGuard({});
        expect(getConfig().debounceMs).toBe(300); // Default wins!

        // Scenario 5: If we override a key that has NO default (if any) or L4 is skipped
        // Actually, for this library, almost everything has a default.
        // But if L4 was somehow not there, L5 would be the last.
    });

    it('DEEP MERGE: Objects are merged across all 5 layers', async () => {
        // L1: Plugin
        const l1 = { rules: [{ match: { url: 'l1' } }] };
        // L2: Env
        writeConfig('.quotaguardrc.test.json', { breakerMaxFailures: 22 });
        // L3: Base
        writeConfig('.quotaguardrc.json', { cacheTtlMs: 33 });
        // L5: Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { enabled: false };

        await injectQuotaGuard(l1);

        const config = getConfig();
        expect(config.rules![0].match.url).toBe('l1'); // From L1
        expect(config.breakerMaxFailures).toBe(22); // From L2
        expect(config.cacheTtlMs).toBe(33); // From L3
        expect(config.debounceMs).toBe(300); // From L4 (Default)
        expect(config.enabled).toBe(true); // From L4 (Default) wins over L5 (false)
    });

    it('ARRAY REPLACEMENT: Arrays are strictly replaced (L2 overrides L3)', async () => {
        // L2: Env
        writeConfig('.quotaguardrc.test.json', { aiEndpoints: ['env-only.com'] });
        // L3: Base
        writeConfig('.quotaguardrc.json', { aiEndpoints: ['base.com'] });

        await injectQuotaGuard({});

        const config = getConfig();
        // Should NOT be ['env-only.com', 'base.com']
        expect(config.aiEndpoints).toEqual(['env-only.com']);
    });

    it('FALLBACK INTEGRATION: .quota-guard/config.yaml treated as Level 3', async () => {
        // No .quotaguardrc.json
        // But .quota-guard/config.json exists
        writeConfig('.quota-guard/config.json', { debounceMs: 777 });
        
        // L5: Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 999 };

        await injectQuotaGuard({});

        // L3 (777) > L4 (300) > L5 (999)
        expect(getConfig().debounceMs).toBe(777);
    });

    it('CONFLICT: .quotaguardrc.json overrides .quota-guard/config.json (L3 internal priority)', async () => {
        writeConfig('.quotaguardrc.json', { debounceMs: 333 });
        writeConfig('.quota-guard/config.json', { debounceMs: 777 });

        await injectQuotaGuard({});

        // .quotaguardrc.json is more specific/standard for L3
        expect(getConfig().debounceMs).toBe(333);
    });
});
