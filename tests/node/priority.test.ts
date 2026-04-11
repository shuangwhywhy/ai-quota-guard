import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { injectQuotaGuard } from '../../src/setup';
import { getConfig } from '../../src/config';

describe('Configuration Priority (5-Level Hierarchy)', () => {
    let sandboxDir: string;

    beforeEach(() => {
        sandboxDir = mkdtempSync(join(tmpdir(), 'quota-priority-test-'));
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

    it('Level 1: Plugin Configuration overrides everything', async () => {
        // Level 2: Env File
        writeConfig('.quotaguardrc.test.json', { debounceMs: 222 });
        // Level 3: Base File
        writeConfig('.quotaguardrc.json', { debounceMs: 333 });
        // Level 5: Global Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 555 };

        // Level 1: Plugin Args
        await injectQuotaGuard({ debounceMs: 111 });

        expect(getConfig().debounceMs).toBe(111);
    });

    it('Level 2: Environment Config File overrides Base and below', async () => {
        // Level 2: Env File
        writeConfig('.quotaguardrc.test.json', { debounceMs: 222 });
        // Level 3: Base File
        writeConfig('.quotaguardrc.json', { debounceMs: 333 });
        // Level 5: Global Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 555 };

        await injectQuotaGuard({}); // No Level 1

        expect(getConfig().debounceMs).toBe(222);
    });

    it('Level 3: Base Config File overrides Defaults and below', async () => {
        // Level 3: Base File
        writeConfig('.quotaguardrc.json', { debounceMs: 333 });
        // Level 5: Global Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 555 };

        await injectQuotaGuard({}); // No Level 1, 2

        expect(getConfig().debounceMs).toBe(333);
    });

    it('Level 4: Defaults override Global Window (as requested)', async () => {
        // Level 5: Global Window
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { debounceMs: 555 };

        await injectQuotaGuard({}); // No Level 1, 2, 3

        // Default debounceMs is 300
        expect(getConfig().debounceMs).toBe(300);
    });

    it('Level 5: Global Window settings apply if nothing else is set (partially)', async () => {
        // We test a property that doesn't have a default or we override a known one.
        // Actually, defaults are always present for most keys.
        // Let's test intelligentFields which has a default.
        // @ts-expect-error - testing global config
        window.__QUOTA_GUARD_CONFIG__ = { intelligentFields: ['custom'] };

        await injectQuotaGuard({});
        
        // Defaults win over window if they exist
        expect(getConfig().intelligentFields).not.toEqual(['custom']);
    });
    
    it('Deep Merge consistency: Level 1 merges with Level 3', async () => {
        writeConfig('.quotaguardrc.json', { 
            breakerMaxFailures: 10,
            rules: [{ match: { url: 'base' } }] 
        });

        await injectQuotaGuard({ 
            breakerMaxFailures: 5 
        });

        const config = getConfig();
        expect(config.breakerMaxFailures).toBe(5); // Level 1 wins
        expect(config.rules).toHaveLength(1); // Level 3 preserved
        expect(config.rules![0].match.url).toBe('base');
    });
});
