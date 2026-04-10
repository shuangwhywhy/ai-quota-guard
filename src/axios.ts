import { getConfig } from './config';

interface AxiosLike {
  interceptors: {
    request: {
      use: (fn: (config: Record<string, unknown>) => Record<string, unknown>) => void;
    };
  };
  VERSION?: string;
}

/**
 * Attaches Quota Guard to an Axios instance.
 * It strictly targets known AI endpoints and instructs Axios to dispatch them
 * via `fetch` instead of `XMLHttpRequest` / `http`.
 * Since Quota Guard already intercepts `globalThis.fetch`, this seamlessly 
 * applies all deduplication, caching, and breaker logic.
 * 
 * @param axiosInstance - The Axios instance (e.g., `import axios from 'axios'`)
 */
export const hookAxios = (axiosInstance: unknown) => {
  if (
    !axiosInstance || 
    typeof axiosInstance !== 'object' || 
    !('interceptors' in axiosInstance)
  ) {
    // eslint-disable-next-line no-console
    console.warn('[Quota Guard] Invalid Axios instance provided.');
    return;
  }

  const instance = axiosInstance as AxiosLike;
  
  if (!instance.interceptors?.request) {
    // eslint-disable-next-line no-console
    console.warn('[Quota Guard] Axios instance lacks request interceptors.');
    return;
  }
  
  instance.interceptors.request.use((config) => {
    const guardConfig = getConfig();
    if (!guardConfig.enabled) return config;

    // Resolve effective URL
    const urlStr = (config.url as string) || '';
    const baseURLStr = (config.baseURL as string) || '';
    const fullPath = urlStr.startsWith('http') ? urlStr : baseURLStr + urlStr;
    
    const isAI = guardConfig.aiEndpoints.some((ep) => {
      if (ep instanceof RegExp) return ep.test(fullPath);
      return fullPath.includes(String(ep));
    });
    
    if (isAI) {
      // Force Axios to utilize the `fetch` adapter.
      // Requires Axios >= 1.7.0.
      if (instance.VERSION) {
        const versionMatch = instance.VERSION.match(/^(\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1], 10);
          const minor = parseInt(versionMatch[2], 10);
          if (major < 1 || (major === 1 && minor < 7)) {
            // eslint-disable-next-line no-console
            console.warn(`[Quota Guard] Axios version ${instance.VERSION} lacks native fetch adapter support. Guard disabled for this instance.`);
            return config;
          }
        }
      }
      config.adapter = 'fetch';
    }
    
    return config;
  });

  // eslint-disable-next-line no-console
  console.log('[Quota Guard] Axios interceptor active.');
};
