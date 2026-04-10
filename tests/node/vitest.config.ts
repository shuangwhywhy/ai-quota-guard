import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'node',
    environment: 'node', // Pure Node.js
    globals: true,
    include: ['**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['../../src/**/*.ts'],
    },
  },
});
