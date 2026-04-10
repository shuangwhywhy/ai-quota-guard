/**
 * Minimal local types for Vite to avoid build-time resolution issues
 * while maintaining strict type safety without 'any'.
 */
export interface ViteResolvedConfig {
  command: 'serve' | 'build';
  mode: string;
}

export interface ViteIndexHtmlTag {
  tag: string;
  attrs: Record<string, string | boolean | undefined>;
  injectTo: 'head' | 'body' | 'head-prepend' | 'body-prepend';
}

export interface VitePlugin {
  name: string;
  configResolved?: (config: ViteResolvedConfig) => void;
  resolveId?: (id: string | null | undefined) => string | null | undefined | void;
  load?: (id: string) => string | null | undefined | void;
  transformIndexHtml?: () => ViteIndexHtmlTag[] | void;
}

import type { QuotaGuardConfig } from './config';

/**
 * Standard Vite Plugin for Quota Guard.
 * In development mode, it automatically injects the network interceptor
 * at the very beginning of the application lifecycle via transformIndexHtml.
 */
export function QuotaGuardPlugin(options: Partial<QuotaGuardConfig> = {}): VitePlugin {
  let isDev = false;
  const virtualModuleId = '/@quota-guard/register';

  return {
    name: 'vite-plugin-quota-guard',
    
    configResolved(config) {
      // Quota Guard only activates during 'vite serve' in development mode
      isDev = config.command === 'serve';
    },

    resolveId(id) {
      if (id === virtualModuleId) {
        return id;
      }
      return null;
    },

    load(id) {
      if (id === virtualModuleId) {
        // This virtual module triggers the global hook and applies user configuration.
        // It relies on the 'quota-guard' package being installed.
        return [
          `import { setConfig } from "quota-guard";`,
          `import "quota-guard/register";`,
          `setConfig(${JSON.stringify(options)});`
        ].join('\n');
      }
      return null;
    },

    transformIndexHtml() {
      if (!isDev) return;

      return [
        {
          tag: 'script',
          attrs: { 
            type: 'module', 
            src: virtualModuleId 
          },
          injectTo: 'head-prepend'
        }
      ];
    }
  };
}

/**
 * Alias for QuotaGuardPlugin to maintain camelCase naming convention if preferred.
 */
export const quotaGuardPlugin = QuotaGuardPlugin;
