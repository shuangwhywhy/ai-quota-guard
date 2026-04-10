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

/**
 * Standard Vite Plugin for Quota Guard.
 * In development mode, it automatically injects the network interceptor
 * at the very beginning of the application lifecycle via transformIndexHtml.
 */
export function quotaGuardPlugin(): VitePlugin {
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
        // This virtual module simply triggers the global hook.
        // It relies on the 'quota-guard' package being installed.
        return `import "quota-guard/register";`;
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
