export function quotaGuardPlugin() {
  return {
    name: 'vite-plugin-quota-guard',
    configResolved(config: any) {
      // In Vite, config.mode is 'development' or 'production'
      if (config.mode !== 'development') {
        console.log('[Quota Guard] Disabled for production build.');
      }
    },
    transform(code: string, id: string) {
      // Very basic injection for the app entry point if in dev
      // A more robust approach would dynamically import the setup script at the top of main.js/ts
      // But for a simple plugin we can just virtual module it or use Vite's inject
      if (process.env.NODE_ENV === 'development' && /[\/\\](main|index)\.[tj]sx?$/.test(id)) {
        return {
          code: `import "quota-guard/register";\n${code}`,
          map: null
        };
      }
      return null;
    }
  };
}
