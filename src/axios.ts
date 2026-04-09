import { getConfig } from './config';

/**
 * Attaches Quota Guard to an Axios instance.
 * It strictly targets known AI endpoints and instructs Axios to dispatch them
 * via `fetch` instead of `XMLHttpRequest` / `http`.
 * Since Quota Guard already intercepts `globalThis.fetch`, this seamlessly 
 * applies all deduplication, caching, and breaker logic.
 * 
 * @param axiosInstance - The Axios instance (e.g., `import axios from 'axios'`)
 */
export const hookAxios = (axiosInstance: any) => {
  if (!axiosInstance || !axiosInstance.interceptors) {
    console.warn('[Quota Guard] Invalid Axios instance provided.');
    return;
  }
  
  axiosInstance.interceptors.request.use((config: any) => {
    const guardConfig = getConfig();
    if (!guardConfig.enabled) return config;

    // Resolve effective URL
    const urlStr = config.url || '';
    const baseURLStr = config.baseURL || '';
    const fullPath = urlStr.startsWith('http') ? urlStr : baseURLStr + urlStr;
    
    const isAI = guardConfig.aiEndpoints.some((ep: string) => fullPath.includes(ep));
    
    if (isAI) {
      // Force Axios to utilize the `fetch` adapter.
      // Requires Axios >= 1.7.0. For older versions, this might fall back to XHR or throw,
      // but it is the safest, zero-dependency way to bridge Axios to our guarded fetch.
      config.adapter = 'fetch';
    }
    
    return config;
  });

  console.log('[Quota Guard] Axios interceptor active.');
};
