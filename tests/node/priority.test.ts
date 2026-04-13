import { describe, it, expect, beforeEach } from 'vitest';
import { setConfig, getConfig, ConfigSource, getDefaultConfig } from '../../src/config';

describe('Layered Configuration Priority', () => {
  beforeEach(() => {
    // Reset by setting defaults back to their layer
    setConfig(getDefaultConfig(), ConfigSource.Default);
    // Clear other layers by setting them to empty objects
    const layersToClear = [
        ConfigSource.Global,
        ConfigSource.FileBase,
        ConfigSource.FileEnv,
        ConfigSource.EnvVar,
        ConfigSource.Plugin,
        ConfigSource.Manual
    ];
    for (const source of layersToClear) {
        setConfig({}, source);
    }
  });

  it('respects the priority regardless of call order (Incremental Merge)', () => {
    // 1. Set higher priority first
    setConfig({ enabled: false }, ConfigSource.Manual);
    expect(getConfig().enabled).toBe(false);

    // 2. Set lower priority later - should NOT override manual
    setConfig({ enabled: true }, ConfigSource.FileBase);
    expect(getConfig().enabled).toBe(false); // Manual wins

    // 3. Update manual - should change
    setConfig({ enabled: true }, ConfigSource.Manual);
    expect(getConfig().enabled).toBe(true);
  });

  it('merges different fields across layers', () => {
    setConfig({ cacheTtlMs: 123 }, ConfigSource.FileBase);
    setConfig({ debounceMs: 456 }, ConfigSource.Plugin);
    
    const config = getConfig();
    expect(config.cacheTtlMs).toBe(123);
    expect(config.debounceMs).toBe(456);
  });

  it('correctly overrides deep arrays (overwrites instead of concatenating)', () => {
    setConfig({ aiEndpoints: ['base.api'] }, ConfigSource.FileBase);
    setConfig({ aiEndpoints: ['override.api'] }, ConfigSource.Manual);
    
    const config = getConfig();
    expect(config.aiEndpoints).toEqual(['override.api']);
  });

  it('handles environmental JSON via EnvVar source', () => {
    setConfig({ cacheKeyStrategy: 'exact' }, ConfigSource.EnvVar);
    expect(getConfig().cacheKeyStrategy).toBe('exact');
  });

  it('works with the new Vite plugin call pattern', () => {
    // Simulate what the injected Vite script does
    const fileBase = { cacheTtlMs: 1000 };
    const fileEnv = { cacheTtlMs: 2000, enabled: false };
    const pluginOptions = { enabled: true };

    setConfig(fileBase, ConfigSource.FileBase);
    setConfig(fileEnv, ConfigSource.FileEnv);
    setConfig(pluginOptions, ConfigSource.Plugin);

    const config = getConfig();
    expect(config.cacheTtlMs).toBe(2000); // FileEnv > FileBase
    expect(config.enabled).toBe(true);    // Plugin > FileEnv
  });

  it('ensures manual code-level setConfig always wins', () => {
    // Even if plugin says enabled:true
    setConfig({ enabled: true }, ConfigSource.Plugin);
    // User code says enabled:false
    setConfig({ enabled: false }, ConfigSource.Manual);
    
    expect(getConfig().enabled).toBe(false);
  });

  it('supports fallback via Global (window configuration)', () => {
    // Set a global fallback
    setConfig({ cacheTtlMs: 999 }, ConfigSource.Global);
    expect(getConfig().cacheTtlMs).toBe(999);

    // Set a file config - should override global
    setConfig({ cacheTtlMs: 222 }, ConfigSource.FileBase);
    expect(getConfig().cacheTtlMs).toBe(222);
  });

  it('preserves fields that are not present in higher layers', () => {
    // Level 10 sets endpoints
    setConfig({ aiEndpoints: ['legacy.api'] }, ConfigSource.FileBase);
    // Level 50 only sets enabled
    setConfig({ enabled: false }, ConfigSource.Manual);

    const config = getConfig();
    expect(config.enabled).toBe(false);
    expect(config.aiEndpoints).toEqual(['legacy.api']); // endpoints preserved from lower layer
  });

  it('correctly handles deep merging for complex objects like rules', () => {
    const baseRules = [{ match: { url: '/v1' }, override: { debounceMs: 100 } }];
    const manualRules = [{ match: { url: '/v2' }, override: { debounceMs: 200 } }];

    setConfig({ rules: baseRules }, ConfigSource.FileBase);
    expect(getConfig().rules).toEqual(baseRules);

    // Manual rules override base rules entirely (due to array overwrite rule)
    setConfig({ rules: manualRules }, ConfigSource.Manual);
    expect(getConfig().rules).toEqual(manualRules);
  });

  it('ignores null or undefined in higher layers to allow partial overrides', () => {
    setConfig({ debounceMs: 300 }, ConfigSource.FileBase);
    // Setting it to undefined in a higher layer should keep the lower one if utilizing defu normally,
    // though usually you'd just not include it.
    // @ts-expect-error - testing undefined handling
    setConfig({ debounceMs: undefined }, ConfigSource.Manual);
    
    expect(getConfig().debounceMs).toBe(300);
  });
});
