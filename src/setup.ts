import { setConfig, QuotaGuardConfig } from './config';
import { hookFetch } from './core/interceptor';

export const injectQuotaGuard = (config?: Partial<QuotaGuardConfig>) => {
  if (config) {
    setConfig(config);
  }
  hookFetch();
  console.log('[Quota Guard] Active.');
};
