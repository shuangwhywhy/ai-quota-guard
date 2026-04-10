import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { quotaGuardPlugin } from '../src/vite';

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
      const plugin = quotaGuardPlugin() as any;
      const resolved = plugin.resolveId('/@quota-guard/register');
      expect(resolved).toBe('/@quota-guard/register');
      
      const nonMatching = plugin.resolveId('other-module');
      expect(nonMatching).toBeNull();
    });

    it('loads the virtual module correctly', () => {
      const plugin = quotaGuardPlugin() as any;
      const content = plugin.load('/@quota-guard/register');
      expect(content).toContain('import "quota-guard/register"');
      
      const nonMatching = plugin.load('other-module');
      expect(nonMatching).toBeNull();
    });

    it('injects script tag only in development (serve)', () => {
      const plugin = quotaGuardPlugin() as any;
      
      // Simulate PRODUCTION build
      plugin.configResolved({ command: 'build' });
      const prodResult = plugin.transformIndexHtml();
      expect(prodResult).toBeUndefined();

      // Simulate DEVELOPMENT serve
      plugin.configResolved({ command: 'serve' });
      const devResult = plugin.transformIndexHtml();
      expect(devResult).toBeDefined();
      expect(devResult[0].tag).toBe('script');
      expect(devResult[0].attrs.src).toBe('/@quota-guard/register');
      expect(devResult[0].injectTo).toBe('head-prepend');
    });
  });
});
