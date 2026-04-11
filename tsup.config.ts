import { defineConfig } from 'tsup';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    register: 'src/register.ts',
    vite: 'src/vite.ts',
    cli: 'src/cli.ts'
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  shims: true,
  external: ['vite'],
  define: {
    PKG_VERSION: JSON.stringify(pkg.version),
  },
});
