import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadQuotaGuardConfig, mergeConfig } from '../../src/loader';

describe('Quota Guard Configuration Loader (Strict Sandbox)', () => {
  let sandboxDir: string;

  beforeEach(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'quota-guard-test-'));
  });

  afterEach(() => {
    if (existsSync(sandboxDir)) {
      rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  const writeConfig = (name: string, content: string) => {
    const fullPath = join(sandboxDir, name);
    // Ensure parent directory exists
    const dir = join(fullPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
    return fullPath;
  };

  it('Discovery: loads from root .quotaguardrc.json', async () => {
    writeConfig('.quotaguardrc.json', JSON.stringify({ enabled: false }));
    const { base } = await loadQuotaGuardConfig(undefined, undefined, sandboxDir);
    expect(base.enabled).toBe(false);
  });

  it('Discovery: loads from .quota-guard/config.yaml', async () => {
    writeConfig('.quota-guard/config.yaml', 'enabled: false\ndebounceMs: 777');
    const { base } = await loadQuotaGuardConfig(undefined, undefined, sandboxDir);
    expect(base.enabled).toBe(false);
    expect(base.debounceMs).toBe(777);
  });

  it('Priority: Env > Base', async () => {
    writeConfig('.quotaguardrc.json', JSON.stringify({ enabled: true, debounceMs: 100 }));
    writeConfig('.quotaguardrc.production.json', JSON.stringify({ enabled: false }));
    
    const { base, specific } = await loadQuotaGuardConfig('production', undefined, sandboxDir);
    const config = mergeConfig(base, specific);
    expect(config.enabled).toBe(false);
    expect(config.debounceMs).toBe(100); // Merged from base
  });

  it('Merging: Strict Array Replacement', async () => {
    writeConfig('.quotaguardrc.json', JSON.stringify({ aiEndpoints: ['api.openai.com'] }));
    writeConfig('.quotaguardrc.production.json', JSON.stringify({ aiEndpoints: ['api.anthropic.com'] }));
    
    const { base, specific } = await loadQuotaGuardConfig('production', undefined, sandboxDir);
    const config = mergeConfig(base, specific);
    expect(config.aiEndpoints).toEqual(['api.anthropic.com']);
  });

  it('Merging: Object Deep Merge', async () => {
    writeConfig('.quotaguardrc.json', JSON.stringify({ 
      breakerMaxFailures: 5,
      rules: [{ match: { url: 'old' } }]
    }));
    writeConfig('.quotaguardrc.production.json', JSON.stringify({ 
      breakerMaxFailures: 10
    }));
    
    const { base, specific } = await loadQuotaGuardConfig('production', undefined, sandboxDir);
    const config = mergeConfig(base, specific);
    expect(config.breakerMaxFailures).toBe(10);
    expect(config.rules).toHaveLength(1);
    expect(config.rules![0].match.url).toBe('old');
  });

  it('Format Parity: same output for JSON and YAML', async () => {
    writeConfig('.quotaguardrc.json', JSON.stringify({ enabled: false }));
    const { base: baseJson } = await loadQuotaGuardConfig(undefined, undefined, sandboxDir);
    
    rmSync(sandboxDir, { recursive: true, force: true });
    sandboxDir = mkdtempSync(join(tmpdir(), 'quota-guard-test-'));
    writeConfig('.quotaguardrc.yaml', 'enabled: false');
    const { base: baseYaml } = await loadQuotaGuardConfig(undefined, undefined, sandboxDir);
    
    expect(baseJson.enabled).toBe(baseYaml.enabled);
  });

  it('Package.json: loads from quotaguard field', async () => {
    writeConfig('package.json', JSON.stringify({ 
        name: 'test-pkg',
        quotaguard: { enabled: false, debounceMs: 123 } 
    }));
    const { base } = await loadQuotaGuardConfig(undefined, undefined, sandboxDir);
    expect(base.enabled).toBe(false);
    expect(base.debounceMs).toBe(123);
  });
});
