import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { quotaGuardPlugin } from '../src/vite';

describe('Vite Plugin (quotaGuardPlugin)', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns a valid Vite plugin object with name and hooks', () => {
    const plugin = quotaGuardPlugin();
    expect(plugin.name).toBe('vite-plugin-quota-guard');
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.transform).toBe('function');
  });

  it('injects register import for main.ts in development', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('console.log("app")', '/src/main.ts');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('import "quota-guard/register"');
    expect(result!.code).toContain('console.log("app")');
  });

  it('injects register import for main.tsx (React)', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('ReactDOM.render()', '/src/main.tsx');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('import "quota-guard/register"');
  });

  it('injects register import for main.jsx (React)', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('ReactDOM.render()', '/src/main.jsx');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('import "quota-guard/register"');
  });

  it('injects register import for index.ts', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('export default app', '/src/index.ts');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('import "quota-guard/register"');
  });

  it('injects register import for index.js', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('module.exports = app', '/src/index.js');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('import "quota-guard/register"');
  });

  it('does NOT inject for non-entry files (e.g. utils.ts)', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('export const foo = 1', '/src/utils.ts');
    expect(result).toBeNull();
  });

  it('does NOT inject for component files (e.g. App.tsx)', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('export default App', '/src/App.tsx');
    expect(result).toBeNull();
  });

  it('does NOT inject in production mode', () => {
    process.env.NODE_ENV = 'production';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('console.log("app")', '/src/main.ts');
    expect(result).toBeNull();
  });

  it('handles Windows path separators correctly', () => {
    process.env.NODE_ENV = 'development';
    const plugin = quotaGuardPlugin();
    const result = plugin.transform('app()', 'C:\\Users\\dev\\project\\src\\main.tsx');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('import "quota-guard/register"');
  });

  it('configResolved logs for production mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = quotaGuardPlugin();
    plugin.configResolved({ mode: 'production' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Disabled'));
    spy.mockRestore();
  });

  it('configResolved does not log for development mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = quotaGuardPlugin();
    plugin.configResolved({ mode: 'development' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
