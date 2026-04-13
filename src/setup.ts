import { setConfig, QuotaGuardConfig } from './config.js';
import { applyGlobalGuards } from './core/interceptor.js';

export const injectQuotaGuard = async (config?: Partial<QuotaGuardConfig> & { configPath?: string }) => {
  const isProd = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production';

  // 0. Production Safety Check: Absolutely no-op in production to prevent performance or security leakage.
  if (isProd) {
    // eslint-disable-next-line no-console
    console.log(
      `┌───────────────────────────────────────┐\n` +
      `│ [Quota Guard] v${typeof PKG_VERSION !== 'undefined' ? PKG_VERSION : '?.?.?'} READY            │\n` +
      `│ Mode: Production (Bypass)             │\n` +
      `└───────────────────────────────────────┘`
    );
    return;
  }

  // 1. Hook immediately to prevent race conditions during async config loading
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
  
  // 3. Layered Application
  // We call setConfig for each discovered layer. 
  // The internal registry handles the actual prioritized merge.
  const { ConfigSource } = await import('./config.js');

  if (globalConfig) {
    setConfig(globalConfig, ConfigSource.Global);
  }

  if (fileConfig.base) {
    setConfig(fileConfig.base, ConfigSource.FileBase);
  }

  if (fileConfig.specific) {
    setConfig(fileConfig.specific, ConfigSource.FileEnv);
  }

  if (envVarConfig) {
    setConfig(envVarConfig, ConfigSource.EnvVar);
  }

  if (config) {
    // Note: 'config' contains both config options AND 'configPath'.
    // We only pass the actual config options to setConfig.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { configPath, ...options } = config;
    if (Object.keys(options).length > 0) {
      setConfig(options, ConfigSource.Manual);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `┌───────────────────────────────────────┐\n` +
    `│ [Quota Guard] v${typeof PKG_VERSION !== 'undefined' ? PKG_VERSION : '?.?.?'} READY            │\n` +
    `│ Mode: Development (Guarded)           │\n` +
    `└───────────────────────────────────────┘`
  );
};
