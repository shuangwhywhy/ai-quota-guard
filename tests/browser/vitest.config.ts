import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    name: 'browser',
    globals: true,
    browser: {
      enabled: true,
      provider: playwright(), // FIX: playwright is a function call
      instances: [
        { browser: 'chromium' }
      ],
      headless: true,
    },
    include: ['**/*.test.ts'],
  },
});
