import { setConfig, QuotaGuardConfig } from './config.js';
import { hookFetch } from './core/interceptor.js';

export const injectQuotaGuard = async (config?: Partial<QuotaGuardConfig> & { configPath?: string }) => {
  // 0. Hook immediately to prevent race conditions during async config loading
  hookFetch();

  let fileConfig: { base: Partial<QuotaGuardConfig>, specific: Partial<QuotaGuardConfig> } = { base: {}, specific: {} };
  
  // 1. Node-only: Auto-load files via c12
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      // Use dynamic import for Node loading to prevent browser bundling issues
      const { loadQuotaGuardConfig } = await import('./loader.js');
      fileConfig = await loadQuotaGuardConfig(process.env.NODE_ENV, config?.configPath);
    } catch {
      // Loader might be stripped or unavailable in some environments
    }
  }

  // 2. Load from browser global if available (Level 5: Lowest priority)
  const globalConfig = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__QUOTA_GUARD_CONFIG__ as Partial<QuotaGuardConfig> | undefined
    : undefined;
  
  // 3. Composite Merge (Hierarchy requested by user)
  // 1: Plugin Args > 2: Env File > 3: Base File > 4: Defaults > 5: Global Window
  try {
    const { quotaGuardMerger } = await import('./loader.js');
    const { getDefaultConfig } = await import('./config.js');
    
    const mergedConfig = quotaGuardMerger(
        config || {},                      // Level 1: Plugin Configuration (Highest)
        fileConfig.specific || {},         // Level 2: Environment Config File
        fileConfig.base || {},             // Level 3: Base Config File
        getDefaultConfig(),                // Level 4: Defaults
        globalConfig || {}                 // Level 5: Non-Plugin Code Settings (Lowest)
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
        ...config 
    };
    setConfig(mergedConfig);
  }

  // eslint-disable-next-line no-console
  console.log(
    `┌───────────────────────────────────────┐\n` +
    `│ [Quota Guard] v1.9.0 READY            │\n` +
    `│ Mode: ${process.env.NODE_ENV === 'production' ? 'Production (Bypass)' : 'Development (Guarded)'}        │\n` +
    `└───────────────────────────────────────┘`
  );
};
