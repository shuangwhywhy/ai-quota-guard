/* eslint-disable no-console */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

async function runSmokeTest() {
  console.log('🚀 Starting Quota Guard Distribution Smoke Test...');

  const cliPath = path.join(pkgRoot, 'dist', 'cli.mjs');
  const tempScript = path.join(pkgRoot, 'scripts', 'temp-smoke-helper.js');
  
  // 1. Create a simple helper file to avoid shell quoting issues
  fs.writeFileSync(tempScript, "console.log('Main Script Execution'); setTimeout(() => {}, 200);");

  try {
    const child = spawn('node', [cliPath, 'node', tempScript], {
      cwd: pkgRoot,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    });

    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    await new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        console.log(output);
        if (code === 0 && output.includes('[Quota Guard]') && output.includes('READY')) {
          console.log('✅ Smoke Test Passed: Distribution is loadable and functional.');
          resolve();
        } else {
          console.error('❌ Smoke Test Failed!');
          if (!output.includes('[Quota Guard]')) {
            console.error('Error: Quota Guard banner not found in output.');
          }
          reject(new Error(`Smoke test failed with exit code ${code}`));
        }
      });
    });
  } finally {
    // 2. Clean up
    if (fs.existsSync(tempScript)) fs.unlinkSync(tempScript);
  }
}

runSmokeTest().catch(err => {
  console.error(err);
  process.exit(1);
});
