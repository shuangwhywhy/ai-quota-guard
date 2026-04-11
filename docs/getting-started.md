# Getting Started

Quota Guard is designed for a frictionless setup. Depending on your environment (Backend or Frontend), follow the appropriate path.

## 1. Installation

Install the package via your preferred package manager:

```bash
npm install @shuangwhywhy/quota-guard
# or
yarn add @shuangwhywhy/quota-guard
# or
pnpm add @shuangwhywhy/quota-guard
```

---

## 2. Node.js (Backend / Tools)

For Node.js, the most "zero-intrusive" way is to register the guard via command-line flags. This works with any script, including tests (Vitest/Jest) or dev servers.

### Using CLI Registration (Recommended)
This approach requires **zero code changes** to your application.

**For CommonJS or simple scripts:**
```bash
node --require @shuangwhywhy/quota-guard/register app.js
```

**For ESM (`"type": "module"`):**
```bash
# Node >= 20.6.0
node --import @shuangwhywhy/quota-guard/register app.js
```

### Manual Injection (Code-based)
If you prefer to initialize the guard explicitly in your entry file:

```typescript
import { injectQuotaGuard } from '@shuangwhywhy/quota-guard';

injectQuotaGuard({
  // Optional configuration
  enabled: process.env.NODE_ENV === 'development'
});
```

---

## 3. Vite (Frontend)

Quota Guard provides a dedicated Vite plugin that injects the guard into your browser environment during development.

### Setup `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default defineConfig({
  plugins: [
    quotaGuardPlugin({
      // The guard is automatically disabled in production mode
      // unless you explicitly override it.
    })
  ]
});
```

---

## 4. Interaction & Verification

Once setup, look for these signals to confirm Quota Guard is active:

### The Startup Banner
You should see a clear banner in your terminal (Node.js) or browser console (Vite):

```text
┌───────────────────────────────────────┐
│ [Quota Guard] v1.9.0 READY            │
│ Mode: Development (Guarded)           │
└───────────────────────────────────────┘
```

### Network Tab Inspection
Open your browser's **Network Tab** (or use a tool like Proxyman/Charles) and inspect AI requests. Look for the `X-Quota-Guard` header:
- `HIT`: Cached response.
- `SHARED`: Joined an existing live stream.
- `LIVE`: New network call.
- `BYPASS`: Request skipped guards due to internal rules.
