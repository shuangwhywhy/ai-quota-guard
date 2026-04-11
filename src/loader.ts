import { loadConfig } from 'c12';
import { createDefu } from 'defu';
import type { QuotaGuardConfig } from './config.js';

export const quotaGuardMerger = createDefu((obj: Record<string, unknown>, key, value) => {
  if (Array.isArray(obj[key]) || Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
});

export async function loadQuotaGuardConfig(env?: string, customPath?: string, cwd?: string): Promise<{ base: Partial<QuotaGuardConfig>, specific: Partial<QuotaGuardConfig> }> {
  const targetCwd = cwd || process.cwd();
  const envName = env || process.env.NODE_ENV || 'development';
  
  // 1. Base load
  const base = await loadConfig<QuotaGuardConfig>({
    name: 'quotaguard',
    cwd: targetCwd,
    configFile: customPath || '.quotaguardrc',
    rcFile: false,
    packageJson: true,
    globalConfig: false,
    envName: false,
  });

  // 2. Specific load
  const specific = await loadConfig<QuotaGuardConfig>({
    name: 'quotaguard',
    cwd: targetCwd,
    configFile: `.quotaguardrc.${envName}`,
    rcFile: false,
    packageJson: false,
    globalConfig: false,
    envName: false,
  });

  // 3. Fallback for .quota-guard/
  let fallbackConfig: Partial<QuotaGuardConfig> = {};
  if (!base._configFile && !specific._configFile) {
     const dirBase = await loadConfig<QuotaGuardConfig>({
        name: 'quotaguard',
        cwd: targetCwd,
        configFile: '.quota-guard/config',
        rcFile: false,
        packageJson: false,
        globalConfig: false,
     });
     if (dirBase.config) fallbackConfig = dirBase.config;
  }

  return {
    base: { ...fallbackConfig, ...base.config },
    specific: specific.config || {}
  };
}

export function mergeConfig(base: Partial<QuotaGuardConfig>, override: Partial<QuotaGuardConfig>) {
  return quotaGuardMerger(override, base);
}
