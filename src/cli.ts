#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Helper for ESM/CJS compatibility in source
const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const pkgContents = fs.readFileSync(path.join(_dirname, '../package.json'), 'utf8');
const pkg = JSON.parse(pkgContents);

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

function startDocServer(docsPath: string, port = 3000) {
  const server = http.createServer((req, res) => {
    let url = req.url || '/';
    if (url === '/') url = '/index.html';
    
    // Safety check for absolute paths or parent traversal
    const safePath = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(docsPath, safePath);

    // Basic MIME types
    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.md': 'text/markdown',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(500);
          res.end(`Server error: ${err.code}`);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n┌─────────────────────────────────────────┐`);
    console.log(`│ [Quota Guard] Documentation Server      │`);
    console.log(`│                                         │`);
    console.log(`│ - Local:    ${url.padEnd(28)} │`);
    console.log(`│                                         │`);
    console.log(`│ Press Ctrl+C to stop the server         │`);
    console.log(`└─────────────────────────────────────────┘\n`);

    // Open browser based on OS
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} ${url}`).on('error', () => {
      console.log(`\n(Note: Could not automatically open browser. Please visit ${url} manually.)`);
    });
  });

  // Handle termination
  process.on('SIGINT', () => {
    console.log('\nClosing documentation server...');
    server.close();
    process.exit();
  });
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
AI Quota Guard CLI v${pkg.version}

Usage:
  qg init           Create a .quotaguardrc.ts configuration file
  qg docs           Open interactive documentation in browser
  qg version        Show version
`);
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(`v${pkg.version}`);
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

  if (command === 'docs') {
    const docsPath = path.join(_dirname, '../docs');
    
    if (!fs.existsSync(docsPath)) {
      // Fallback if we are in dist/ but docs are at root
      const alternatePath = path.join(_dirname, '../../docs');
      if (!fs.existsSync(alternatePath)) {
        console.error(`Error: Documentation directory not found at ${docsPath}`);
        process.exit(1);
      }
      startDocServer(alternatePath);
    } else {
      startDocServer(docsPath);
    }
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
