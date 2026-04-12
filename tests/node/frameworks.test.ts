import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectQuotaGuard } from '../../src/setup.js';
import { getConfig, setConfig } from '../../src/config.js';

describe('Framework-Specific Simulation (Proof of Agnosticism)', () => {

    beforeEach(() => {
        vi.stubEnv('QUOTA_GUARD_CONFIG', '');
        setConfig({});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('Next.js (Server-side)', () => {
        it('should correctly prioritize QUOTA_GUARD_CONFIG even if NEXT_PUBLIC_ vars are present', async () => {
            // Simulate 'qg run next dev'
            vi.stubEnv('QUOTA_GUARD_CONFIG', JSON.stringify({ cacheTtlMs: 777 }));
            vi.stubEnv('NEXT_PUBLIC_SOME_VAR', 'true');

            await injectQuotaGuard();
            
            expect(getConfig().cacheTtlMs).toBe(777);
        });
    });

    describe('Webpack (Generic Bundler)', () => {
        it('should initialize when window global is present', async () => {
            // Simulate a browser-like bundle initialization by mocking window
            vi.stubGlobal('window', {
                __QUOTA_GUARD_CONFIG__: { debounceMs: 888 }
            });
            // Hide node-ness to focus on global window detection
            vi.stubGlobal('process', {
                ...process,
                versions: { ...process.versions, node: undefined }
            });

            await injectQuotaGuard();
            
            expect(getConfig().debounceMs).toBe(888);
        });
    });

    describe('NestJS / Express (Long-running Node)', () => {
        it('should maintain state correctly', async () => {
            await injectQuotaGuard();
            
            setConfig({ enabled: true, cacheTtlMs: 500 });
            expect(getConfig().cacheTtlMs).toBe(500);
            expect(getConfig().enabled).toBe(true);
        });
    });
});
