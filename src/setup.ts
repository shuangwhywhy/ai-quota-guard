import { setConfig, QuotaGuardConfig } from './config.js';
import { applyGlobalGuards } from './core/interceptor.js';

export const injectQuotaGuard = async (config?: Partial<QuotaGuardConfig> & { configPath?: string }) => {
  // 0. Hook immediately to prevent race conditions during async config loading
  await applyGlobalGuards();

  let fileConfig: { base: Partial<QuotaGuardConfig>, specific: Partial<QuotaGuardConfig> } = { base: {}, specific: {} };
  let envVarConfig: Partial<QuotaGuardConfig> = {};

  // 1. Node-only: Auto-load files via c12 & environment variables
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // 1.1 Read from QUOTA_GUARD_CONFIG env var (Level 2: High priority)
    if (process.env.QUOTA_GUARD_CONFIG) {
      try {
        envVarConfig = JSON.parse(process.env.QUOTA_GUARD_CONFIG);
      } catch {
        // eslint-disable-next-line no-console
        console.warn('[Quota Guard] Failed to parse QUOTA_GUARD_CONFIG env var. It must be valid JSON.');
      }
    }

    try {
      // Use dynamic import for Node loading to prevent browser bundling issues
      const { loadQuotaGuardConfig } = await import('./loader.js');
      fileConfig = await loadQuotaGuardConfig(process.env.NODE_ENV, config?.configPath);
    } catch {
      // Loader might be stripped or unavailable in some environments
    }
  }

  // 2. Load from browser global if available (Level 6: Lowest priority)
  const globalConfig = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__QUOTA_GUARD_CONFIG__ as Partial<QuotaGuardConfig> | undefined
    : undefined;
  
  // 3. Composite Merge (Hierarchy)
  // 1: Plugin Args > 2: Env JSON > 3: Env File > 4: Base File > 5: Defaults > 6: Global Window
  try {
    const { quotaGuardMerger } = await import('./loader.js');
    const { getDefaultConfig } = await import('./config.js');
    
    const mergedConfig = quotaGuardMerger(
        config || {},                      // Level 1: Explicit Code Call / Plugin Configuration (Highest)
        envVarConfig,                      // Level 2: Environment Variable JSON
        fileConfig.specific || {},         // Level 3: Environment Config File
        fileConfig.base || {},             // Level 4: Base Config File
        globalConfig || {},                // Level 5: Legacy/Generic UI Settings (Window)
        getDefaultConfig()                 // Level 6: Defaults (Lowest)
    );
    
    if (Object.keys(mergedConfig).length > 0) {
      setConfig(mergedConfig as Partial<QuotaGuardConfig>);
    }
  } catch {
    // Basic fallback for environments where loader is stripped
    const { getDefaultConfig } = await import('./config.js');
    const mergedConfig = { 
        ...globalConfig, 
        ...getDefaultConfig(), 
        ...fileConfig.base,
        ...fileConfig.specific,
        ...envVarConfig,
        ...config 
    };
    setConfig(mergedConfig);
  }

  // eslint-disable-next-line no-console
  console.log(
    `┌───────────────────────────────────────┐\n` +
    `│ [Quota Guard] v${typeof PKG_VERSION !== 'undefined' ? PKG_VERSION : '?.?.?'} READY            │\n` +
    `│ Mode: ${process.env.NODE_ENV === 'production' ? 'Production (Bypass)' : 'Development (Guarded)'}        │\n` +
    `└───────────────────────────────────────┘`
  );
};
