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
  load?: (id: string) => string | null | undefined | void | Promise<string | null | undefined | void>;
  transformIndexHtml?: () => ViteIndexHtmlTag[] | void;
}

import { QuotaGuardConfig } from './config.js';
import { loadQuotaGuardConfig } from './loader.js';

/**
 * Standard Vite Plugin for Quota Guard.
 * In development mode, it automatically injects the network interceptor
 * at the very beginning of the application lifecycle via transformIndexHtml.
 */
export function QuotaGuardPlugin(options: Partial<QuotaGuardConfig> & { configPath?: string } = {}): VitePlugin {
  let isDev = false;
  let viteMode = 'development';
  const virtualModuleId = '/@quota-guard/register';

  return {
    name: 'vite-plugin-quota-guard',
    
    configResolved(config) {
      // Quota Guard only activates during 'vite serve' in development mode
      isDev = config.command === 'serve';
      viteMode = config.mode;
    },

    resolveId(id) {
      if (id === virtualModuleId) {
        return id;
      }
      return null;
    },

    async load(id) {
      if (id === virtualModuleId) {
        // 1. Load from file system based on Vite mode (env isolation)
        const fileConfig = await loadQuotaGuardConfig(viteMode, options.configPath);
        
        // 2. Composite: Plugin Options > File Config
        // We use the same merger to ensure consistency
        const { quotaGuardMerger } = await import('./loader.js');
        const finalConfig = quotaGuardMerger(options, fileConfig);

        // This virtual module triggers the global hook and applies user configuration.
        // It relies on the 'quota-guard' package being installed.
        return [
          `import { setConfig } from "@shuangwhywhy/quota-guard";`,
          `import "@shuangwhywhy/quota-guard/register";`,
          `setConfig(${JSON.stringify(finalConfig)});`
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
