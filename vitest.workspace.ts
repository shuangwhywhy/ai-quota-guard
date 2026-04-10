import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'node',
      environment: 'jsdom', // Keep jsdom for unit tests that need DOM matchers but not real browser
      include: ['tests/**/*.{test,spec}.ts'],
      exclude: ['tests/browser.test.ts', 'tests/browser_integration.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts']
      }
    }
  },
  {
    test: {
      name: 'browser',
      browser: {
        enabled: true,
        name: 'chromium',
        provider: 'playwright',
        headless: true
      },
      include: ['tests/browser.test.ts', 'tests/browser_integration.test.ts'],
    }
  }
]);
