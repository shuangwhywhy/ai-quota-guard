import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

export default defineConfig({
  test: {
    // Consolidated Projects for Node and Real Browser Environments
    projects: [
      {
        name: 'node',
        define: {
          PKG_VERSION: JSON.stringify(pkg.version),
        },
        test: {
          environment: 'node',
          include: ['tests/node/**/*.test.ts'],
          exclude: ['tests/browser/**/*'],
        }
      },
      {
        name: 'browser',
        define: {
          PKG_VERSION: JSON.stringify(pkg.version),
        },
        test: {
          include: ['tests/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' }
            ],
            headless: true, // Set to false to see the browser during local runs
            api: {
              host: '127.0.0.1',
              port: 63315 // Vitest default browser port
            }
          }
        },
        optimizeDeps: {
          include: [
            '@mswjs/interceptors',
            '@mswjs/interceptors/fetch',
            '@mswjs/interceptors/XMLHttpRequest'
          ]
        }
      }
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    }
  }
});
