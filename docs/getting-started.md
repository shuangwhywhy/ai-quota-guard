# Getting Started

Quota Guard is built for a frictionless, zero-intrusion experience. You can protect your AI budget in seconds without changing a single line of your application code.

---

## 1. Installation

Install the engine via your preferred package manager:

```bash
npm install @shuangwhywhy/quota-guard
```

---

## 2. The Zero-Intrusion Path (Recommended)

The easiest way to guard **any framework** (Next.js, Vite, NestJS, Nuxt, etc.) is via the CLI runner. This injects the firewall at the runtime level without modifying your source files.

```bash
# 1. Initialize your firewall config
npx qg init

# 2. Wrap your start/dev command
npx qg run npm run dev
npx qg run npx next dev
npx qg run node app.js
```

### Why use the CLI?
- **Zero Code Stain**: No need to `import` anything in your business logic.
- **Easy Cleanup**: Stop using it by just removing the `qg run` prefix.
- **Node-native**: Use the latest `--import` or `--require` hooks automatically.

---

## 3. The Frontend Path (Vite)

For pure frontend projects or if you prefer build-tool integration, use the Vite plugin.

### Setup `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default defineConfig({
  plugins: [
    quotaGuardPlugin({
      // The firewall is intentionally disabled in production 
      // by default to ensure maximum performance for real users.
    })
  ]
});
```

---

## 4. The Manual Path (Entry Point)

If you prefer explicit control, you can register the guard at the very top of your application entry point (e.g., `main.ts` or `app/layout.tsx`).

```typescript
import '@shuangwhywhy/quota-guard/register';
```

---

## 5. Verification: Is the Firewall Active?

Quota Guard provides instant feedback so you know your tokens are safe.

### The Startup Banner
When you start your app with the guard active, you will see a clear confirmation:

```text
┌───────────────────────────────────────┐
│ 🛡️ [Quota Guard] ACTIVE              │
│ Mode: Development (Firewall ON)       │
└───────────────────────────────────────┘
```

### The Network Tab (The "Proof")
Open your browser's **Network Tab** and inspect any AI request. Quota Guard injects `X-Quota-Guard` response headers for real-time observability:

- `HIT`: Cache hit. Request never reached the provider. **($0 spent)**.
- `SHARED`: Joined an existing live stream. **(Tokens saved)**.
- `LIVE`: New network call. Firewall verified and allowed.
- `BYPASS`: Request skipped guards (e.g., because it wasn't an AI endpoint).

---

## Next Steps
- **[Core Scenarios](./scenarios.md)**: Learn how to handle HMR, loops, and workflow debugging.
- **[Configuration](./configuration.md)**: Tune the circuit breaker and cache settings.
