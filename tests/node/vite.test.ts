import { describe, it, expect } from 'vitest';
import { quotaGuardPlugin } from '../../src/vite';

describe('Vite Plugin (quotaGuardPlugin)', () => {
  it('returns a valid Vite plugin object with new lifecycle hooks', () => {
    const plugin = quotaGuardPlugin();
    expect(plugin.name).toBe('vite-plugin-quota-guard');
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.resolveId).toBe('function');
    expect(typeof plugin.load).toBe('function');
    expect(typeof plugin.transformIndexHtml).toBe('function');
  });

  describe('Lifecycle Hooks', () => {
    it('handles virtual module resolution', () => {
      // @ts-expect-error - testing virtual methods
      const plugin = quotaGuardPlugin();
      const resolved = plugin.resolveId('/@quota-guard/register');
      expect(resolved).toBe('/@quota-guard/register');
      
      const nonMatching = plugin.resolveId('other-module');
      expect(nonMatching).toBeNull();
    });

    it('loads the virtual module correctly', async () => {
      // @ts-expect-error - testing virtual methods
      const plugin = quotaGuardPlugin();
      const content = await plugin.load('/@quota-guard/register');
      expect(content).toContain('import "@shuangwhywhy/quota-guard/register"');
      
      const nonMatching = await plugin.load('other-module');
      expect(nonMatching).toBeNull();
    });

    it('injects script tag only in development (serve)', () => {
      // @ts-expect-error - testing virtual methods
      const plugin = quotaGuardPlugin();
      
      // Simulate PRODUCTION build
      plugin.configResolved({ command: 'build', mode: 'production' });
      const prodResult = plugin.transformIndexHtml();
      expect(prodResult).toBeUndefined();

      // Simulate DEVELOPMENT serve
      plugin.configResolved({ command: 'serve', mode: 'development' });
      const devResult = plugin.transformIndexHtml();
      expect(devResult).toBeDefined();
      expect(devResult[0].tag).toBe('script');
      expect(devResult[0].attrs.src).toBe('/@quota-guard/register');
      expect(devResult[0].injectTo).toBe('head-prepend');
    });

    it('serializes custom options into the virtual module with layering', async () => {
      // @ts-expect-error - testing virtual methods
      const plugin = quotaGuardPlugin({ enabled: false, debounceMs: 999 });
      plugin.configResolved({ command: 'serve', mode: 'development' });
      
      const content = await plugin.load('/@quota-guard/register');
      // Verify layered calls
      expect(content).toContain('setConfig');
      expect(content).toContain('ConfigSource.Plugin');
      expect(content).toContain('"enabled":false');
      expect(content).toContain('"debounceMs":999');
    });
  });
});
