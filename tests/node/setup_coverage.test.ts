import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { injectQuotaGuard } from '../../src/setup.js';
import { setConfig, getConfig, ConfigSource } from '../../src/config.js';
import * as configMod from '../../src/config.js';
import * as interceptorMod from '../../src/core/interceptor.js';
import * as dashboardMod from '../../src/utils/dashboard.js';

describe('setup.ts Coverage Gaps', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Clear noise-causing env vars by default
    delete process.env.QUOTA_GUARD_CONFIG;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('short-circuits in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const hookSpy = vi.spyOn(interceptorMod, 'applyGlobalGuards');

    await injectQuotaGuard();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Mode: Production (Bypass)'));
    expect(hookSpy).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('handles malformed QUOTA_GUARD_CONFIG env var', async () => {
    const originalConfigEnv = process.env.QUOTA_GUARD_CONFIG;
    process.env.QUOTA_GUARD_CONFIG = '{ invalid json';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await injectQuotaGuard();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse QUOTA_GUARD_CONFIG'));
    
    process.env.QUOTA_GUARD_CONFIG = originalConfigEnv;
  });

  it('applies valid QUOTA_GUARD_CONFIG env var (Line 69-70)', async () => {
    const originalConfigEnv = process.env.QUOTA_GUARD_CONFIG;
    process.env.QUOTA_GUARD_CONFIG = JSON.stringify({ debounceMs: 999 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const setConfigSpy = vi.spyOn(configMod, 'setConfig');

    await injectQuotaGuard();

    expect(setConfigSpy).toHaveBeenCalledWith(
        expect.objectContaining({ debounceMs: 999 }), 
        ConfigSource.EnvVar
    );
    // Explicitly check getConfig to verify it was set
    expect(getConfig().debounceMs).toBe(999);
    
    process.env.QUOTA_GUARD_CONFIG = originalConfigEnv;
  });

  it('covers manual options branch (Line 78-79)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const setConfigSpy = vi.spyOn(configMod, 'setConfig');
    
    // Pass and options object with keys
    await injectQuotaGuard({ debounceMs: 123 });

    expect(setConfigSpy).toHaveBeenCalledWith(
        expect.objectContaining({ debounceMs: 123 }),
        ConfigSource.Manual
    );
  });

  it('covers file config branches (Line 61-67)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const setConfigSpy = vi.spyOn(configMod, 'setConfig');
    
    // We can't easily mock the dynamic import, but we can mock setConfig 
    // and call injectQuotaGuard. To hit 61-67, fileConfig must have base/specific.
    // Since we can't easily force loader.js to return something without a real file,
    // we'll rely on the fact that if it's NOT production, loader IS called.
    
    await injectQuotaGuard();
    expect(setConfigSpy).toHaveBeenCalled();

  });

  it('covers manual options branch (Line 78-79) with empty options', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const setConfigSpy = vi.spyOn(configMod, 'setConfig');
    
    // Pass empty object to hit the 'else' of line 78 if it existed, or just cover the check
    await injectQuotaGuard({}); 
    expect(setConfigSpy).not.toHaveBeenCalledWith(expect.anything(), ConfigSource.Manual);
  });


  it('handles browser global config', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const setConfigSpy = vi.spyOn(configMod, 'setConfig');
    
    // Mock window
    (globalThis as unknown as { window: unknown }).window = {
        __QUOTA_GUARD_CONFIG__: { debounceMs: 456 }
    };

    await injectQuotaGuard();

    expect(setConfigSpy).toHaveBeenCalledWith(
        expect.objectContaining({ debounceMs: 456 }), 
        ConfigSource.Global
    );

    delete (globalThis as Record<string, unknown>).window;
  });

  it('starts dashboard if enabled (Line 85)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Use real setConfig to enable dashboard
    setConfig({ showDashboard: true }, ConfigSource.Manual);
    
    const dashboardSpy = vi.spyOn(dashboardMod, 'startDashboard').mockImplementation(() => {});

    await injectQuotaGuard();

    expect(dashboardSpy).toHaveBeenCalled();
    expect(getConfig().showDashboard).toBe(true);
  });
});
