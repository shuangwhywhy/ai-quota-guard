import { setConfig, QuotaGuardConfig } from './config';
import { hookFetch } from './core/interceptor';

export const injectQuotaGuard = (config?: Partial<QuotaGuardConfig>) => {
  // 1. Load from browser global if available
  const globalConfig = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__QUOTA_GUARD_CONFIG__ as Partial<QuotaGuardConfig> | undefined
    : undefined;
  
  // 2. Composite: Direct Args > Global Window > Defaults
  if (globalConfig || config) {
    setConfig({ ...globalConfig, ...config });
  }

  hookFetch();
  // eslint-disable-next-line no-console
  console.log('[Quota Guard] Active.');
};
