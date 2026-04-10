import { defineWorkspace, defineConfig } from 'vitest/config';

export default defineWorkspace([
  {
    name: 'node',
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/node/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts']
      }
    }
  },
  {
    name: 'browser',
    test: {
      browser: {
        enabled: true,
        name: 'chromium',
        provider: 'playwright',
        headless: true
      },
      include: ['tests/browser/**/*.test.ts'],
    }
  }
]);
