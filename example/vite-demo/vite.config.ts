import { defineConfig } from 'vite';
import { quotaGuardPlugin } from '../../dist/vite.js';
import path from 'path';

export default defineConfig({
  plugins: [
    quotaGuardPlugin({
      enabled: true,
      aiEndpoints: ['api.openai.com', 'localhost:5173/mock-ai'],
      cacheTtlMs: 10000,
    })
  ],
  resolve: {
    alias: {
      'quota-guard': path.resolve(__dirname, '../../dist/index.mjs')
    }
  }
});
