import type { ICacheAdapter } from './cache/memory';

export interface QuotaGuardConfig {
  /** If false, Quota Guard transparently passes everything through. Default: true in dev, false in prod */
  enabled: boolean;
  /** List of hostnames to intercept natively. Default: OpenAI, Anthropic, DeepSeek, Google */
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
  cacheKeyStrategy?: 'intelligent' | 'exact' | ((url: string, method: string, body: any) => any);
  /** Custom audit logger */
  auditHandler?: (event: AuditEvent) => void;
  /** Optional external cache store adapter (e.g., Redis, FileSystem) */
  cacheAdapter?: ICacheAdapter;
}

export interface AuditEvent {
  type: 'request_started' | 'cache_hit' | 'live_called' | 'in_flight_shared' | 'debounced' | 'breaker_opened' | 'request_failed' | 'request_aborted' | 'pass_through';
  key: string;
  url: string;
  timestamp: number;
  details?: any;
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
  };
};

let activeConfig: QuotaGuardConfig = getDefaultConfig();

export const setConfig = (overrides: Partial<QuotaGuardConfig>) => {
  activeConfig = { ...getDefaultConfig(), ...overrides };
};

export const getConfig = (): QuotaGuardConfig => activeConfig;
