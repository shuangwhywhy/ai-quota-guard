#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json';

// Declared by tsup define in tsup.config.ts
declare const PKG_VERSION: string;

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



export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
AI Quota Guard CLI v${VERSION}

Usage:
  qg init           Create a .quotaguardrc.ts configuration file
  qg version        Show version
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
