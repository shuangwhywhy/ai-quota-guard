import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'example/**',
        'tests/**',
        '**/*.d.ts',
        'tsup.config.ts',
        'vitest.config.ts',
      ],
    },
  },
});
