import { setConfig, QuotaGuardConfig, getConfig } from './config.js';
import { applyGlobalGuards } from './core/interceptor.js';
import { startDashboard } from './utils/dashboard.js';
import { globalStats } from './utils/stats-collector.js';

export const injectQuotaGuard = async (config?: Partial<QuotaGuardConfig> & { configPath?: string }) => {
  // 0. Early Passive Log Capture (Pass-through mode)
  // Ensure we record EVERYTHING from the very start, even before we know if dashboard is enabled.
  if (typeof process !== 'undefined' && process.stdout && process.stdout.write) {
    const originalWrite = process.stdout.write;
    
    process.stdout.write = function(
        chunk: string | Uint8Array, 
        encoding?: string | ((error?: Error | null) => void), 
        callback?: (error?: Error | null) => void
    ) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        globalStats.addLog(str);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return originalWrite.apply(process.stdout, [chunk, encoding as any, callback as any]);
    };

    const originalErrWrite = process.stderr.write;
    process.stderr.write = function(
        chunk: string | Uint8Array, 
        encoding?: string | ((error?: Error | null) => void), 
        callback?: (error?: Error | null) => void
    ) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        globalStats.addLog(str); // Already flavored in dashboard if needed, but here it's raw
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return originalErrWrite.apply(process.stderr, [chunk, encoding as any, callback as any]);
    };
  }

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

  // 4. Start Dashboard if enabled
  if (getConfig().showDashboard) {
    await startDashboard();
  }

  // eslint-disable-next-line no-console
  console.log(
    `┌───────────────────────────────────────┐\n` +
    `│ [Quota Guard] v${typeof PKG_VERSION !== 'undefined' ? PKG_VERSION : '?.?.?'} READY            │\n` +
    `│ Mode: Development (Guarded)           │\n` +
    `└───────────────────────────────────────┘`
  );
};
