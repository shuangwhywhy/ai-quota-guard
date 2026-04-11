# Demos & Examples

The Quota Guard repository includes several ready-to-run examples to help you understand how the library behaves in real-world environments.

## 1. Node.js Simple Demo
**Path**: `example/node-simple/`

A minimal script that uses `injectQuotaGuard` programmatically to intercept a mock AI endpoint. It demonstrates:
- Cache HIT on the second call.
- The `X-Quota-Guard` header in simulated responses.

### How to run:
```bash
# From the root of the repo
cd example/node-simple
npm install
npm run dev
```

---

## 2. Vite + React Demo
**Path**: `example/vite-demo/`

A complete frontend application integrated with the `quotaGuardPlugin`. This is the best way to visualize:
- Parallel request deduplication in a UI.
- Browser `IndexedDB` persistence.
- Real-time streaming interception.

### How to run:
```bash
cd example/vite-demo
npm install
npm run dev
```
Open your browser's **Network Tab** to see the magic.

---

## 3. The CLI Quickstart
You don't even need a separate project to test Quota Guard. You can use the built-in CLI to initialize a sandbox.

```bash
# Initialize a config in your current folder
npx qg init

# Verify the config hierarchy
npx qg status
```

---

## 4. Copy-Paste Sandbox
Want to try it right now? Create a file named `test-guard.mjs`:

```javascript
import { injectQuotaGuard } from '@shuangwhywhy/quota-guard';

// 1. Initialize
injectQuotaGuard({
  aiEndpoints: [/httpbin.org/], // Intercept this for testing
  cacheTtlMs: 5000
});

async function runTest() {
  console.log('--- Phase 1: Call 1 (Live) ---');
  await fetch('https://httpbin.org/post', { method: 'POST', body: JSON.stringify({ prompt: 'hello' }) });

  console.log('\n--- Phase 2: Call 2 (Cache HIT) ---');
  const res = await fetch('https://httpbin.org/post', { method: 'POST', body: JSON.stringify({ prompt: 'hello' }) });
  console.log('Status Header:', res.headers.get('x-quota-guard'));
}

runTest();
```

Run it with: `node test-guard.mjs`
