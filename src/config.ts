import type { ICacheAdapter } from './cache/memory';

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
  /** List of hostnames (strings or regex strings like "/.../") to intercept natively. */
  aiEndpoints: string[];
  /** Debug cache TTL in milliseconds. Default: 3600000 (1 hour) */
  cacheTtlMs: number;
  /** Max consecutive failures before breaker opens. Default: 3 */
  breakerMaxFailures: number;
  /** Breaker cool-off period in MS. Default: 30000 (30s) */
  breakerResetTimeoutMs: number;
  /** Time in ms to delay requests and merge identical in-flight requests. 0 to disable. Default: 300 */
  debounceMs: number;
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
  type: 'request_started' | 'cache_hit' | 'live_called' | 'in_flight_shared' | 'debounced' | 'breaker_opened' | 'request_failed' | 'request_aborted' | 'pass_through';
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
  'api.mistral.ai'
];

export const getDefaultConfig = (): QuotaGuardConfig => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    enabled: !isProd,
    aiEndpoints: [...DEFAULT_AI_ENDPOINTS],
    cacheTtlMs: 1000 * 60 * 60, // 1 hour for debug caching
    breakerMaxFailures: 3,
    breakerResetTimeoutMs: 30000,
    debounceMs: 300,
    cacheKeyStrategy: 'intelligent',
    intelligentFields: ['model', 'messages', 'prompt', 'system', 'contents', 'message'],
    rules: [],
    keyHeaders: [],
    bypassCacheHeaders: ['cache-control', 'pragma'],
  };
};


let activeConfig: QuotaGuardConfig = getDefaultConfig();

export const setConfig = (overrides: Partial<QuotaGuardConfig>) => {
  activeConfig = { ...getDefaultConfig(), ...overrides };
};

export const getConfig = (): QuotaGuardConfig => activeConfig;
