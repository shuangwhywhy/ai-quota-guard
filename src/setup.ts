import { setConfig, QuotaGuardConfig } from './config';
import { hookFetch } from './core/interceptor';

export const injectQuotaGuard = (config?: Partial<QuotaGuardConfig>) => {
  // 1. Load from browser global if available
  const globalConfig = (typeof window !== 'undefined' && (window as any).__QUOTA_GUARD_CONFIG__) as Partial<QuotaGuardConfig> | undefined;
  
  // 2. Composite: Direct Args > Global Window > Defaults
  if (globalConfig || config) {
    setConfig({ ...globalConfig, ...config });
  }

  hookFetch();
  console.log('[Quota Guard] Active.');
};
