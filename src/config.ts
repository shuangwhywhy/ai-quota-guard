import type { ICacheAdapter } from './cache/types.js';

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
  const isProd = process.env.NODE_ENV === 'production';
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
  };
};


let activeConfig: QuotaGuardConfig = getDefaultConfig();

export const setConfig = (overrides: Partial<QuotaGuardConfig>) => {
  activeConfig = { ...getDefaultConfig(), ...overrides };
};

export const getConfig = (): QuotaGuardConfig => activeConfig;

/**
 * Helper to provide type safety and autocompletion for Quota Guard configuration.
 */
export function defineConfig(config: Partial<QuotaGuardConfig>): Partial<QuotaGuardConfig> {
  return config;
}
