#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pkg from '../package.json';
import { loadQuotaGuardConfig } from './loader.js';
import { quotaGuardMerger } from './utils/merge.js';
import { getDefaultConfig, type QuotaGuardConfig } from './config.js';

// Professional self-healing: use build-time injection, fallback to package.json
const VERSION = typeof PKG_VERSION !== 'undefined' ? PKG_VERSION : pkg.version;

const TEMPLATE = `import { defineConfig } from '@shuangwhywhy/quota-guard';

export default defineConfig({
  /**
   * If false, Quota Guard transparently passes everything through.
   * Default: true in development, false in production.
   */
  enabled: true,

  /**
   * List of hostnames (strings or regex objects) to intercept.
   * By default, it intercepts major providers (OpenAI, Anthropic, DeepSeek, Google, etc.).
   */
  aiEndpoints: [],

  /**
   * Debug cache TTL in milliseconds.
   * Default: 3600000 (1 hour).
   */
  cacheTtlMs: 3600000,

  /**
   * Strategy for generating the cache key. 
   * 'intelligent' strips noise like temperature and top_p to maximize hits.
   */
  cacheKeyStrategy: 'intelligent',

  /**
   * Aggregation window in ms to merge identical in-flight requests.
   * Helps prevent "thundering herd" during UI re-renders.
   */
  debounceMs: 300,

  /**
   * Specific behavioral rules for targeting subsets of requests.
   */
  rules: [
    {
      match: {
        url: /v1\\/chat\\/completions/,
      },
      override: {
        cacheTtlMs: 86400000, // Cache chat for 24 hours
      }
    }
  ]
});
`;

/**
 * Execute a command with Quota Guard injected via NODE_OPTIONS.
 */
async function runWithGuard(args: string[], cwd: string) {
  const finalArgs = [...args];
  const overrides: Partial<QuotaGuardConfig> = {};

  // Parse QG specific flags
  while (finalArgs.length > 0 && finalArgs[0].startsWith('--')) {
    const flag = finalArgs[0];
    if (flag === '--dashboard') {
      overrides.showDashboard = true;
      finalArgs.shift();
    } else if (flag === '--no-dashboard') {
      overrides.showDashboard = false;
      finalArgs.shift();
    } else if (flag === '--') {
      finalArgs.shift();
      break;
    } else {
      // Allow other flags to pass through to the child command
      break;
    }
  }

  if (finalArgs.length === 0) {
    console.error('Error: No command provided.');
    process.exit(1);
  }

  // 1. Load configuration
  const env = process.env.NODE_ENV || 'development';
  const fileConfigs = await loadQuotaGuardConfig(env, undefined, cwd);
  const finalConfig = quotaGuardMerger(
    overrides, // CLI flags have highest priority
    fileConfigs.specific || {},
    fileConfigs.base || {},
    getDefaultConfig()
  );

  // 2. Prepare environment variables
  const newEnv = { ...process.env };
  newEnv.QUOTA_GUARD_CONFIG = JSON.stringify(finalConfig);

  // 3. Determine Node injection flag (register entry point)
  const registerPath = '@shuangwhywhy/quota-guard/register';
  
  // Node >= 20.6.0 supports --import
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
  const isModern = majorVersion > 20 || (majorVersion === 20 && parseInt(nodeVersion.split('.')[1], 10) >= 6);
  
  const injectionFlag = isModern ? `--import ${registerPath}` : `--loader ${registerPath}`;
  
  if (newEnv.NODE_OPTIONS) {
    newEnv.NODE_OPTIONS = `${injectionFlag} ${newEnv.NODE_OPTIONS}`;
  } else {
    newEnv.NODE_OPTIONS = injectionFlag;
  }

  // 4. Spawn child process
  const child = spawn(finalArgs[0], finalArgs.slice(1), {
    cwd,
    env: newEnv,
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}



export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
AI Quota Guard CLI v${VERSION}

Usage:
  qg [options] <cmd>          Run a command with Quota Guard (implicit run)
  qg run [options] <cmd>      Run a command with Quota Guard (explicit run)
  qg init                     Create a .quotaguardrc.ts configuration file
  qg version                  Show version

Options:
  --dashboard                 Enable real-time terminal dashboard
  --no-dashboard              Disable real-time terminal dashboard
  -v, --version               Show version
  -h, --help                  Show help

Examples:
  qg node app.js              (Implicit run)
  qg --dashboard dev          (Run dev script with dashboard)
  qg run npm start            (Explicit run)
  qg -- node app.js           (Using delimiter)
`);
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(`v${VERSION}`);
    return;
  }

  if (command === 'init') {
    const filename = '.quotaguardrc.ts';
    const targetPath = path.join(cwd, filename);

    if (fs.existsSync(targetPath)) {
      console.error(`Error: ${filename} already exists at ${targetPath}`);
      process.exit(1);
    }

    fs.writeFileSync(targetPath, TEMPLATE, 'utf8');
    console.log(`\n🚀 Quota Guard configuration initialized!\n`);
    console.log(`File created: ${filename}`);
    console.log(`Next steps:`);
    console.log(`  1. Customize the rules in ${filename}`);
    console.log(`  2. Ensure your project is set up to load TS files (or rename to .js/.json)`);
    console.log(`  3. Run your app with Quota Guard active.\n`);
    return;
  }

  if (command === 'run') {
    return runWithGuard(argv.slice(1), cwd);
  }

  // Smart handling for unrecognized commands
  const knownCommands = ['init', 'version', '--version', '-v'];
  if (!knownCommands.includes(command)) {
    // If it looks like a script in package.json, prepend "npm run"
    try {
      const pkgPath = path.join(cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkgContent.scripts && pkgContent.scripts[command]) {
          return runWithGuard(['npm', 'run', ...argv], cwd);
        }
      }
    } catch {
      // Fallback if package.json is missing or malformed
    }

    // Default to implicit run
    return runWithGuard(argv, cwd);
  }



  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

// Only run if this is the main module
const isMain = process.argv[1] && (
  process.argv[1].endsWith('cli.ts') ||
  process.argv[1].endsWith('cli.js') ||
  process.argv[1].endsWith('cli.mjs') ||
  process.argv[1].includes('bin/quota-guard') ||
  process.argv[1].includes('bin/qg')
);

if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
