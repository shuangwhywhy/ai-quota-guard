import type { ICacheAdapter } from './cache/types.js';
import { quotaGuardMerger } from './utils/merge.js';

/**
 * Priority-aware configuration sources.
 * Higher values have higher priority and will override lower ones.
 */
export enum ConfigSource {
  /** System-level hardcoded defaults (Lowest) */
  Default = 0,
  /** Legacy/Generic UI Settings via window global (Level 0.5) */
  Global = 5,
  /** Base configuration from .quotaguardrc (Level 1) */
  FileBase = 10,
  /** Environment-specific configuration from .quotaguardrc.[mode] (Level 2) */
  FileEnv = 20,
  /** Environment variable JSON (QUOTA_GUARD_CONFIG) (Level 3) */
  EnvVar = 30,
  /** Plugin orchestration options (Vite/Webpack) (Level 4) */
  Plugin = 40,
  /** Business code calls (injectQuotaGuard / setConfig) (Highest) */
  Manual = 50,
}

export interface QuotaGuardRule {
  /** Matcher for the request. If it matches, the overrides are applied. */
  match: {
    url?: string | RegExp;
    headers?: Record<string, string | RegExp>;
  };
  /** Behavioral overrides for matching requests */
  override: Partial<Omit<QuotaGuardConfig, 'rules' | 'aiEndpoints'>>;
}

export interface QuotaGuardConfig {
  /** If false, Quota Guard transparently passes everything through. Default: true in dev, false in prod */
  enabled: boolean;
  /** List of hostnames (strings or regex objects) to intercept natively. */
  aiEndpoints: (string | RegExp)[];
  /** Debug cache TTL in milliseconds. Default: 3600000 (1 hour) */
  cacheTtlMs: number;
  /** Max consecutive failures before breaker opens for a specific key. Default: 3 */
  breakerMaxFailures: number;
  /** Global fail-safe: Max consecutive failures across ALL requests before breaker opens. Default: 10 */
  globalBreakerMaxFailures: number;
  /** Breaker cool-off period in MS. Default: 30000 (30s) */
  breakerResetTimeoutMs: number;
  /** Time in ms to delay requests and merge identical in-flight requests. 0 to disable. Default: 300 */
  debounceMs: number;
  /** Max time in ms to wait for a shared in-flight request before timing out. Default: 60000 (60s) */
  inFlightTimeoutMs: number;
  /** Strategy for generating the cache/debounce key. 'intelligent' strips noise like temperature. Default: 'intelligent' */
  cacheKeyStrategy?: 'intelligent' | 'exact' | ((url: string, method: string, body: unknown) => unknown);
  /** Custom fields to extract in 'intelligent' mode if provider is not auto-detected. */
  intelligentFields?: string[];
  /** Custom audit logger */
  auditHandler?: (event: AuditEvent) => void;
  /** Optional external cache store adapter (e.g., Redis, FileSystem) */
  cacheAdapter?: ICacheAdapter;
  /** Specific behavioral rules for targeting subsets of requests */
  rules?: QuotaGuardRule[];
  /** Headers to include in the fingerprint hash generation. */
  keyHeaders?: string[];
  /** Headers that, if present, trigger a cache bypass (Safety Guards still apply). */
  bypassCacheHeaders?: string[];
  /** Whether to show the real-time terminal dashboard. Default: false */
  showDashboard?: boolean;
  /** Whether to log each interception to the console. Default: true in dev */
  consoleLog?: boolean;
  /** Port for the local AI proxy bridge. Default: 1989 */
  proxyPort?: number;
}


export interface AuditEvent {
  type: 'request_started' | 'cache_hit' | 'live_called' | 'in_flight_shared' | 'debounced' | 'breaker_opened' | 'request_failed' | 'request_aborted' | 'pass_through' | 'global_breaker_opened';
  key: string;
  url: string;
  timestamp: number;
  details?: unknown;
}

export const DEFAULT_AI_ENDPOINTS = [
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'generativelanguage.googleapis.com',
  'api.cohere.ai',
  'api.mistral.ai',
  'api.groq.com',
  'api.perplexity.ai',
  'oai.huggingface.co'
];

export const getDefaultConfig = (): QuotaGuardConfig => {
  const isProd = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production';
  return {
    enabled: !isProd,
    aiEndpoints: [...DEFAULT_AI_ENDPOINTS],
    cacheTtlMs: 1000 * 60 * 60, // 1 hour for debug caching
    breakerMaxFailures: 3,
    globalBreakerMaxFailures: 10,
    breakerResetTimeoutMs: 30000,
    debounceMs: 300,
    inFlightTimeoutMs: 60000,
    cacheKeyStrategy: 'intelligent',
    intelligentFields: ['model', 'messages', 'prompt', 'system', 'contents', 'message', 'response_format'],
    rules: [],
    keyHeaders: [],
    bypassCacheHeaders: ['cache-control', 'pragma', 'x-quota-guard-bypass'],
    showDashboard: false,
    consoleLog: !isProd,
    proxyPort: 1989,
  };
};

// --- Layered Configuration Engine ---

const configLayers: Map<ConfigSource, Partial<QuotaGuardConfig>> = new Map();
let activeSnapshot: QuotaGuardConfig = getDefaultConfig();

// Initialize with defaults
configLayers.set(ConfigSource.Default, getDefaultConfig());

/**
 * Re-calculate the final active configuration snapshot by merging all layers
 * from lowest priority to highest priority.
 */
function recalculateSnapshot() {
  // 1. Get all active layers and sort them by their numeric Enum value (Low to High)
  const sortedSources = Array.from(configLayers.keys()).sort((a, b) => a - b);
  
  // 2. Reduce them into a single configuration object.
  // We start with an empty object so that the first layer (Default) sets the baseline.
  let merged: Partial<QuotaGuardConfig> = {};
  for (const source of sortedSources) {
    const layer = configLayers.get(source);
    if (layer) {
      merged = quotaGuardMerger(layer, merged);
    }
  }
  
  activeSnapshot = merged as QuotaGuardConfig;
}

/**
 * Apply configuration overrides from a specific source.
 * Higher priority sources override lower ones regardless of call order.
 * 
 * @param overrides - Partial configuration to apply
 * @param source - The source of this configuration. Defaults to ConfigSource.Manual (Highest).
 */
export const setConfig = (overrides: Partial<QuotaGuardConfig>, source: ConfigSource = ConfigSource.Manual) => {
  configLayers.set(source, overrides);
  recalculateSnapshot();
};

/**
 * Get the current flattened active configuration.
 * This is a high-performance getter that returns a pre-computed snapshot.
 */
export const getConfig = (): QuotaGuardConfig => activeSnapshot;

/**
 * Helper to provide type safety and autocompletion for Quota Guard configuration.
 */
export function defineConfig(config: Partial<QuotaGuardConfig>): Partial<QuotaGuardConfig> {
  return config;
}
